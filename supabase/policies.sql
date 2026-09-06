-- ===================================================================
-- KAUSHAL — row level security
--
-- One rule, applied nine times: an instructor reaches their own
-- academy's rows and nothing else. Two tables carry academy_id
-- directly; the rest reach it through students, which is exactly how
-- src/lib/types.ts declares them.
--
-- Run after schema.sql. Safe to run more than once — every policy is
-- dropped before it is created.
-- ===================================================================

-- -------------------------------------------------------------------
-- The helper every policy is written in terms of.
--
-- Resolves the signed-in user to their academy through the instructors
-- table. SECURITY DEFINER because the lookup itself must not be
-- filtered by the policies it is used to write; STABLE so the planner
-- calls it once per statement rather than once per row; search_path is
-- pinned so a schema on the caller's path cannot shadow instructors.
--
-- Returns null when the caller is not an instructor, and null compared
-- to anything is null, so every policy below denies by default.
-- -------------------------------------------------------------------

create or replace function public.current_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.academy_id
  from public.instructors i
  where i.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_academy_id() from public;
grant execute on function public.current_academy_id() to authenticated;

alter table public.academies     enable row level security;
alter table public.instructors   enable row level security;
alter table public.students      enable row level security;
alter table public.assignments   enable row level security;
alter table public.works         enable row level security;
alter table public.scores        enable row level security;
alter table public.calibrations  enable row level security;
alter table public.alerts        enable row level security;
alter table public.reports       enable row level security;

-- ===================================================================
-- academies
-- ===================================================================

-- An instructor sees only the academy they belong to.
drop policy if exists academies_select on public.academies;
create policy academies_select on public.academies
  for select to authenticated
  using (id = public.current_academy_id());

-- A signed-in user may create an academy, but only one they own. This
-- is the bootstrap case: before the instructor row exists,
-- current_academy_id() is still null.
drop policy if exists academies_insert on public.academies;
create policy academies_insert on public.academies
  for insert to authenticated
  with check (owner_id = auth.uid());

-- An instructor may edit their own academy and may not move it to another.
drop policy if exists academies_update on public.academies;
create policy academies_update on public.academies
  for update to authenticated
  using (id = public.current_academy_id())
  with check (id = public.current_academy_id());

-- Only the owner may delete the academy, and only their own.
drop policy if exists academies_delete on public.academies;
create policy academies_delete on public.academies
  for delete to authenticated
  using (id = public.current_academy_id() and owner_id = auth.uid());

-- ===================================================================
-- instructors
-- ===================================================================

-- An instructor sees the colleagues in their own academy.
drop policy if exists instructors_select on public.instructors;
create policy instructors_select on public.instructors
  for select to authenticated
  using (academy_id = public.current_academy_id());

-- A new instructor row may be added to the caller's academy, or by the
-- owner of an academy that has none yet — the other half of bootstrap.
drop policy if exists instructors_insert on public.instructors;
create policy instructors_insert on public.instructors
  for insert to authenticated
  with check (
    academy_id = public.current_academy_id()
    or exists (
      select 1 from public.academies a
      where a.id = instructors.academy_id and a.owner_id = auth.uid()
    )
  );

-- An instructor may edit rows in their academy and may not move one out of it.
drop policy if exists instructors_update on public.instructors;
create policy instructors_update on public.instructors
  for update to authenticated
  using (academy_id = public.current_academy_id())
  with check (academy_id = public.current_academy_id());

-- An instructor may remove a colleague from their own academy only.
drop policy if exists instructors_delete on public.instructors;
create policy instructors_delete on public.instructors
  for delete to authenticated
  using (academy_id = public.current_academy_id());

-- ===================================================================
-- students
-- ===================================================================

-- An instructor sees only their own academy's students.
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated
  using (academy_id = public.current_academy_id());

-- A new student can only be enrolled into the caller's own academy.
drop policy if exists students_insert on public.students;
create policy students_insert on public.students
  for insert to authenticated
  with check (academy_id = public.current_academy_id());

-- A student may be edited in place but never reassigned to another academy.
drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update to authenticated
  using (academy_id = public.current_academy_id())
  with check (academy_id = public.current_academy_id());

-- Only the owning academy may delete a student, and the delete takes
-- their works, scores, assignments, alerts and reports with it.
drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated
  using (academy_id = public.current_academy_id());

-- ===================================================================
-- assignments — scoped through the student they were set for
-- ===================================================================

-- An instructor sees assignments belonging to their own students.
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = assignments.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- An assignment can only be set for a student in the caller's academy.
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students s
      where s.id = assignments.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- An assignment may be edited or issued, and never handed to another academy.
drop policy if exists assignments_update on public.assignments;
create policy assignments_update on public.assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = assignments.student_id
        and s.academy_id = public.current_academy_id()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = assignments.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Only the owning academy may delete an assignment.
drop policy if exists assignments_delete on public.assignments;
create policy assignments_delete on public.assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = assignments.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- ===================================================================
-- works — scoped through the student who made them
-- ===================================================================

-- An instructor sees only work by their own students.
drop policy if exists works_select on public.works;
create policy works_select on public.works
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = works.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- A work can only be filed against a student in the caller's academy.
drop policy if exists works_insert on public.works;
create policy works_insert on public.works
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students s
      where s.id = works.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- A work may be edited in place and never moved to another academy's student.
drop policy if exists works_update on public.works;
create policy works_update on public.works
  for update to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = works.student_id
        and s.academy_id = public.current_academy_id()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = works.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Only the owning academy may delete a work, and its scores go with it.
drop policy if exists works_delete on public.works;
create policy works_delete on public.works
  for delete to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = works.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- ===================================================================
-- scores — scoped through work, then student
-- ===================================================================

-- An instructor sees only scores on their own students' work.
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to authenticated
  using (
    exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = scores.work_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- A score can only be attached to a work in the caller's academy.
drop policy if exists scores_insert on public.scores;
create policy scores_insert on public.scores
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = scores.work_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Confirming or re-proposing a score is allowed only within the caller's academy.
drop policy if exists scores_update on public.scores;
create policy scores_update on public.scores
  for update to authenticated
  using (
    exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = scores.work_id
        and s.academy_id = public.current_academy_id()
    )
  )
  with check (
    exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = scores.work_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Only the owning academy may delete a score.
drop policy if exists scores_delete on public.scores;
create policy scores_delete on public.scores
  for delete to authenticated
  using (
    exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = scores.work_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- ===================================================================
-- calibrations
-- ===================================================================

-- An instructor sees only their own academy's anchor scores.
drop policy if exists calibrations_select on public.calibrations;
create policy calibrations_select on public.calibrations
  for select to authenticated
  using (academy_id = public.current_academy_id());

-- An anchor may be set only on the caller's academy and on a work inside it.
drop policy if exists calibrations_insert on public.calibrations;
create policy calibrations_insert on public.calibrations
  for insert to authenticated
  with check (
    academy_id = public.current_academy_id()
    and exists (
      select 1
      from public.works w
      join public.students s on s.id = w.student_id
      where w.id = calibrations.work_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- An anchor may be re-scored in place and never moved to another academy.
drop policy if exists calibrations_update on public.calibrations;
create policy calibrations_update on public.calibrations
  for update to authenticated
  using (academy_id = public.current_academy_id())
  with check (academy_id = public.current_academy_id());

-- Only the owning academy may delete an anchor.
drop policy if exists calibrations_delete on public.calibrations;
create policy calibrations_delete on public.calibrations
  for delete to authenticated
  using (academy_id = public.current_academy_id());

-- ===================================================================
-- alerts — scoped through the student they concern
-- ===================================================================

-- An instructor sees only alerts about their own students.
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = alerts.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- An alert can only be raised against a student in the caller's academy.
drop policy if exists alerts_insert on public.alerts;
create policy alerts_insert on public.alerts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students s
      where s.id = alerts.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Resolving or refreshing an alert stays inside the caller's academy.
drop policy if exists alerts_update on public.alerts;
create policy alerts_update on public.alerts
  for update to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = alerts.student_id
        and s.academy_id = public.current_academy_id()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = alerts.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Only the owning academy may delete an alert.
drop policy if exists alerts_delete on public.alerts;
create policy alerts_delete on public.alerts
  for delete to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = alerts.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- ===================================================================
-- reports — scoped through the student they are written about
-- ===================================================================

-- An instructor sees only reports on their own students.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = reports.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- A report can only be written about a student in the caller's academy.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (
    exists (
      select 1 from public.students s
      where s.id = reports.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Editing or approving a report stays inside the caller's academy.
drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = reports.student_id
        and s.academy_id = public.current_academy_id()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = reports.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- Only the owning academy may delete a report.
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
  for delete to authenticated
  using (
    exists (
      select 1 from public.students s
      where s.id = reports.student_id
        and s.academy_id = public.current_academy_id()
    )
  );

-- ===================================================================
-- storage — the 'works' bucket
--
-- Object keys are written by src/lib/dal/supabase.ts as
-- <academy_id>/<filename>, so the first path segment is the tenant and
-- these four policies read exactly that segment.
--
-- The bucket is public, so the object bytes are readable by URL — an
-- <img> tag carries no session. These policies govern the object rows:
-- who may list, upload, replace and remove them.
-- ===================================================================

-- An instructor lists only objects under their own academy's prefix.
drop policy if exists works_objects_select on storage.objects;
create policy works_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'works'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
  );

-- An instructor may upload only under their own academy's prefix.
drop policy if exists works_objects_insert on storage.objects;
create policy works_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'works'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
  );

-- An instructor may replace an object only within their own prefix, and
-- may not move it into someone else's.
drop policy if exists works_objects_update on storage.objects;
create policy works_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'works'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
  )
  with check (
    bucket_id = 'works'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
  );

-- An instructor may delete only their own academy's objects.
drop policy if exists works_objects_delete on storage.objects;
create policy works_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'works'
    and (storage.foldername(name))[1] = public.current_academy_id()::text
  );
