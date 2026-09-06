-- ===================================================================
-- KAUSHAL — schema
--
-- Nine tables, mirroring src/lib/types.ts field for field. If a field
-- changes there it changes here in the same commit; the driver in
-- src/lib/dal/supabase.ts selects columns by name and nothing else.
--
-- Safe to run more than once. Every statement is guarded.
--
-- Run order: schema.sql, then policies.sql, then seed.sql.
-- ===================================================================

create extension if not exists pgcrypto;

-- -------------------------------------------------------------------
-- Enum. The five dimensions, in the order src/lib/rubric.ts declares
-- them. A rubric dimension is not free text: a typo in an insert has to
-- fail loudly, not quietly create a sixth dimension nothing reads.
--
-- The other constrained columns (discipline, status, source, alert
-- type, severity) are text with a CHECK instead. They gain values as
-- the product grows, and adding a value to a CHECK is a one-line
-- migration where an enum is a type rewrite.
-- -------------------------------------------------------------------

do $$
begin
  create type public.dimension as enum (
    'proportion',
    'line_control',
    'value_range',
    'edge_quality',
    'composition'
  );
exception
  when duplicate_object then null;
end
$$;

-- -------------------------------------------------------------------
-- academies
--
-- owner_id is the auth.users id of the instructor who created the
-- academy. There is deliberately no foreign key to auth.users: the
-- seeded demo academy has to exist without an auth user behind it, or
-- the demo cannot be reset on a fresh project.
-- -------------------------------------------------------------------

create table if not exists public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  owner_id uuid not null,
  discipline text not null default 'drawing'
    check (discipline in ('drawing', 'painting', 'sculpture', 'craft', 'other')),
  -- Set once the instructor has scored the ten calibration anchors.
  calibrated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists academies_owner_id_idx on public.academies (owner_id);

-- -------------------------------------------------------------------
-- instructors
--
-- id equals auth.uid() for a signed-in instructor. The RLS helper
-- current_academy_id() resolves a session to an academy through exactly
-- this row, so an instructor without one reaches nothing.
-- -------------------------------------------------------------------

create table if not exists public.instructors (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists instructors_academy_id_idx on public.instructors (academy_id);

-- -------------------------------------------------------------------
-- students
-- -------------------------------------------------------------------

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  joined_at timestamptz not null default now(),
  level integer not null default 1 check (level >= 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'left')),
  created_at timestamptz not null default now()
);

-- The cohort screen reads one academy filtered by status. This is that query.
create index if not exists students_academy_status_idx
  on public.students (academy_id, status);

-- -------------------------------------------------------------------
-- assignments
--
-- Declared before works because works.assignment_id points at it.
-- brief is jsonb: it is an AssignmentBrief the instructor edits whole,
-- never a set of columns anything filters on.
-- -------------------------------------------------------------------

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  target_dimension public.dimension not null,
  brief jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists assignments_student_id_idx
  on public.assignments (student_id, created_at desc);

-- -------------------------------------------------------------------
-- works
--
-- A work outlives the assignment it answered, so assignment_id is set
-- null on delete rather than cascaded. metrics is the ImageMetrics
-- object measured on the canvas at upload.
-- -------------------------------------------------------------------

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  image_url text not null,
  thumb_url text,
  captured_at timestamptz not null default now(),
  assignment_id uuid references public.assignments (id) on delete set null,
  notes text,
  is_calibration boolean not null default false,
  metrics jsonb,
  created_at timestamptz not null default now()
);

-- The trajectory query: one student's works in date order.
create index if not exists works_student_captured_idx
  on public.works (student_id, captured_at);

-- -------------------------------------------------------------------
-- scores
--
-- One row per work per dimension. ai_score is the proposal,
-- confirmed_score is the instructor's number, and the second is the
-- only one the product treats as true. The unique constraint is what
-- makes upsertProposedScores an upsert rather than a race.
-- -------------------------------------------------------------------

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  dimension public.dimension not null,
  ai_score integer check (ai_score between 1 and 10),
  ai_rationale text,
  ai_confidence numeric(4, 3) check (ai_confidence between 0 and 1),
  source text not null default 'manual'
    check (source in ('gemini', 'measured', 'manual', 'cached')),
  confirmed_score integer check (confirmed_score between 1 and 10),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- One proposal per dimension per work.
  constraint scores_work_dimension_key unique (work_id, dimension)
);

-- The score panel reads every score for one work. Narrower than the
-- unique index above, so the planner prefers it for that lookup.
create index if not exists scores_work_id_idx on public.scores (work_id);

-- The confirmation queue counts exactly these rows.
create index if not exists scores_unconfirmed_idx
  on public.scores (work_id) where confirmed_score is null;

-- -------------------------------------------------------------------
-- calibrations
--
-- The instructor's own anchor scores on the ten onboarding works. They
-- are injected into the model prompt, which is how the academy's
-- standard reaches the scorer instead of a generic one.
-- -------------------------------------------------------------------

create table if not exists public.calibrations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  work_id uuid not null references public.works (id) on delete cascade,
  dimension public.dimension not null,
  anchor_score integer not null check (anchor_score between 1 and 10),
  created_at timestamptz not null default now(),
  constraint calibrations_academy_work_dimension_key
    unique (academy_id, work_id, dimension)
);

create index if not exists calibrations_academy_id_idx
  on public.calibrations (academy_id);

-- -------------------------------------------------------------------
-- alerts
-- -------------------------------------------------------------------

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  -- Null for whole-student alerts such as dormant or uncalibrated.
  dimension public.dimension,
  type text not null
    check (type in ('plateau', 'regression', 'dormant', 'uncalibrated')),
  message text not null,
  severity text not null default 'low'
    check (severity in ('high', 'medium', 'low')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Every alert read in the product is an open one.
create index if not exists alerts_student_open_idx
  on public.alerts (student_id) where resolved_at is null;

-- Detection re-runs on every upload. This is the constraint that makes
-- syncAlerts idempotent in the database rather than only in the driver.
-- coalesce is needed because two null dimensions are distinct to a
-- plain unique index, which would let duplicate dormant alerts through.
create unique index if not exists alerts_open_identity_idx
  on public.alerts (student_id, type, coalesce(dimension::text, ''))
  where resolved_at is null;

-- -------------------------------------------------------------------
-- reports
--
-- content is a frozen ReportContent snapshot. Once a report is
-- approved, the numbers in it must not move because a later work
-- changed the trajectory behind it.
-- -------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  content jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists reports_student_created_idx
  on public.reports (student_id, created_at desc);
