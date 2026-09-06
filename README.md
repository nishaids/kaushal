# KAUSHAL

**The measurement layer for learning that cannot be typed.**

Built for GatewayHacks 2026, Track 2 — Equity in Education.

---

## The problem

Skill-based education has no gradebook.

In art, music, dance, craft and vocational training, students produce work rather
than answers. There are no marks, no multiple choice, no submission log. Whatever
the instructor knows about a student lives in the instructor's head.

That works for eight students. It does not work for sixty. A plateau in one skill
is invisible for months, and by the time it is obvious the student has already
decided they are not getting anywhere.

Students quit skill programmes not because they stopped improving, but because
nobody could see that they had.

## What KAUSHAL does

An instructor photographs a student's work. KAUSHAL then:

1. Proposes a score across five concrete visual-skill dimensions, with a
   one-sentence reason for each grounded in what is visible.
2. Asks the instructor to confirm or override every one of them.
3. Plots that student's trajectory per dimension across every session recorded.
4. Flags plateaus — a dimension that stopped moving while the others improved.
5. Drafts the next exercise, aimed at the flagged dimension.
6. Drafts a parent report built from the student's own work, first beside latest.

The instructor is always the authority. KAUSHAL never claims to grade art. It does
the bookkeeping a person teaching sixty students has no time to do.

---

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000> and press **Open the demo**.

```bash
npm run verify      # typecheck, lint, 64 tests, production build
npm test            # the test suite on its own
```

**No credentials are required.** With no environment variables at all, KAUSHAL
runs on a built-in local data driver and a deterministic on-device scorer, and
every screen in the product works end to end. That is deliberate: see
[Degrading honestly](#degrading-honestly).

To point it at real infrastructure, copy `.env.example` to `.env.local` and fill
in whichever parts you have. Each is independent.

| Variable | What it turns on | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Postgres, auth, storage | The built-in local store |
| `SUPABASE_SERVICE_ROLE_KEY` | The `/demo` reset against Postgres | Local reset only |
| `GEMINI_API_KEY` | Vision scoring with Gemini 2.5 Flash | Scores measured from the pixels, labelled as measured |
| `GROQ_API_KEY` | Briefs and reports written by Llama 3.3 70B | A hand-written exercise library and a report assembled from the numbers |
| `DEMO_RESET_TOKEN` | Guards `POST /api/demo/reset` in production | Open in development only |

Supabase setup, including the SQL to run and the storage bucket to create, is in
[`supabase/README.md`](supabase/README.md).

---

## The demo

`/demo` resets the seeded academy to a known state in one click and signs you in.
Nothing you press inside it can break the next run.

It contains **62 students**, several hundred recorded works, ten calibration
anchors, and a handful of students carrying genuine flags. One of them, Aarav
Krishnan, has six works across three months: four dimensions climbing steadily and
**value range flat since week seven**.

None of that is special-cased. The detector fits a line through the last four
works and finds it the same way it would find it in a real academy. You can check
the arithmetic in `src/lib/dal/seed-data.ts`, where the featured student's numbers
are written out by hand with the thresholds they satisfy.

---

## What is tested

64 tests, `npm test`. They cover the parts where being wrong would be quiet
rather than loud:

- **Plateau detection** — that a flat dimension beside climbing peers is found,
  that a student resting on all five is *not* flagged, that the flat run is
  dated from where the student actually stopped rather than earlier, that a
  falling dimension is called fallen, and that a short record produces silence
  instead of a guess.
- **The data contract** — that a re-score can never overwrite a confirmed score,
  that alert sync is idempotent, that one academy cannot read another's rows,
  that every seeded score is a whole number from 1 to 10, and that the demo
  resets to the same shape every time.
- **The pixel measurements** — against images whose answers are known by
  construction: a blank sheet returns finite numbers rather than dividing by
  zero, a single stray speck does not decide the value-range score, parallel
  strokes score as more coherent than a scribble, and every value stays inside
  its documented range.
- **The fallbacks** — that the deterministic scorer validates against the same
  Zod schema the model must satisfy, never claims more than 0.45 confidence,
  and that the built-in exercise library has a real, valid exercise for each of
  the five dimensions.

## The three ideas worth looking at

### 1. Calibration is the moat

Every academy has a different standard. A foundation class and a portfolio class
will not give the same drawing the same number, and neither of them is wrong.

So KAUSHAL does not ship one rubric. At onboarding the instructor scores ten past
works. Those become that academy's **anchors**, and they are injected as few-shot
references into every future scoring call — "this academy calls this a 6 for line
control". The rubric learns their standard rather than a generic one.

Nothing is proposed during calibration. Those numbers have to be the instructor's
alone; anchoring them to a model would defeat the whole mechanism.

- Prompt construction: `src/lib/ai/prompt.ts` → `buildScorePrompt`
- Flow: `src/app/calibrate`, `src/lib/actions/calibration.ts`

### 2. Plateau detection you can explain in one sentence

> We fit a straight line through the last four works for each dimension. A
> dimension is flagged when its line is flat — under 0.06 points a week — and the
> other four are still climbing at 0.12 a week or more.

That contrast is the whole idea. A student who stops for a fortnight is resting,
and every line goes flat together; that is not worth an instructor's attention. A
plateau is one dimension standing still while the same student, on the same works,
keeps improving in the other four.

Ordinary least squares, no smoothing, no model. Every threshold is a named
constant in `src/lib/constants.ts` and every one of them is printed in the UI,
because a threshold nobody can see is a threshold nobody should trust.

- `src/lib/analytics/plateau.ts`, `src/lib/analytics/trajectory.ts`

### 3. Proposed versus confirmed, as a visual grammar

Non-photo blue is the pencil art students draw guidelines with, because it
disappears when the work is reproduced. In KAUSHAL it means exactly that: **this
mark is a proposal and has not been inked yet.**

- A proposed score is blue, dashed, low in value.
- A confirmed score is graphite, solid, the darkest thing on the sheet.
- On the trajectory, unconfirmed points are open blue circles.
- In the cohort table, unconfirmed values are outlines rather than filled bars.

Confirming is not a state change with a tick — it is an overdraw, a graphite plate
wiping across the blue one. The instructor's authority is a property of the
interface, not a disclaimer under it.

Low model confidence renders as literal faintness, and widens the override
affordance.

---

## Degrading honestly

Every AI call has a deterministic fallback, and the product says which one ran.

At upload the image is measured **in the browser**, on the canvas that already
exists for compression: value spread from the 1st and 99th luminance percentiles,
ink coverage, mean and variance of Sobel gradient magnitude, gradient-weighted
mass centre, empty-tile share, and a per-tile doubled-angle circular resultant for
stroke coherence. Zero server cost, zero dependencies.

Those numbers do two jobs. They are injected into the vision prompt as evidence
the model must reconcile with — "if your judgement disagrees with a measurement,
say so in the rationale" — and when the model is unreachable **they are the
fallback score**, with rationales that say what was measured rather than
pretending to have seen the subject, and confidence capped at 0.45.

The settings screen states which data driver and which models are live, and what
happens in their absence. No key is ever rendered or sent to the browser.

- `src/lib/metrics/image-metrics.ts`, `src/lib/utils/compress.ts`
- `src/lib/ai/fallback.ts`, `src/lib/ai/index.ts`

---

## Architecture

```
Next.js 15 (App Router, TypeScript strict, Server Actions)
  ├─ Tailwind CSS v4 + Framer Motion + Recharts
  ├─ src/lib/dal        one DataDriver contract, two drivers (supabase | local)
  ├─ src/lib/ai         Gemini vision, Groq text, deterministic fallback
  ├─ src/lib/analytics  pure functions: trajectory, plateau, cohort, alerts
  ├─ src/lib/actions    Server Actions, every one returning ActionResult
  └─ src/lib/metrics    client-side pixel measurement
Supabase — Postgres, auth, storage, RLS on all nine tables
Vercel — deployment
```

There is no separate backend. Every model call is server-side. Every model
response is schema-forced and validated with Zod, retried once on a parse failure,
and falls through to the deterministic path on a second — no call can hang the UI.

**The data layer is the reason the demo cannot break.** `DataDriver`
(`src/lib/dal/types.ts`) is implemented twice: once against Supabase and once
against a local store. Same surface, same ordering guarantees, same idempotent
alert semantics, same demo reset. Nothing above the data layer knows which is
running, so the product works on a laptop with no credentials and on Postgres with
RLS, unchanged.

## Row-level security

All nine tables have RLS enabled. A `SECURITY DEFINER` helper,
`public.current_academy_id()`, resolves `auth.uid()` to the instructor's academy,
and every select, insert, update and delete policy is written against it. Storage
objects are scoped to the academy's own prefix. The Supabase driver *also* filters
by `academy_id` in every query — defence in depth, and it keeps the query plans
honest. See `supabase/policies.sql`.

---

## Accessibility

Every colour pair in the product was measured rather than eyeballed, and the
ramp was moved until it passed. All text meets WCAG AA (4.5:1) against both the
app ground and the raised plate; the five chart inks are held at 3:1 or better
against the paper *and* against the plateau band, so no data series is ever
fainter than a graphic is allowed to be. `v4` is a mark value and is never used
for text.

Beyond contrast: a skip link, visible focus in the one accent on every
interactive element, `aria-label` on every icon-only control, live regions on
the things that change without a page load, keyboard-navigable comboboxes and
radio groups, a focus-trapped panel that restores focus on close, and
`prefers-reduced-motion` honoured in every animation in the codebase.

## The design

The product measures value range, so the interface is built on one.

The token system is a true ten-step graphite ramp, and hierarchy is expressed
through value the way a graphite drawing does it. There is **not one box-shadow in
the codebase**: elevation is a tonal shift, nearer is lighter, set back is darker,
and the single most important thing on a screen may be carbon. Regions are
separated by hairlines, never by a stack of identical rounded cards.

One accent, non-photo blue, spent on one meaning only. Two typefaces with distinct
jobs: **Archivo** is the instrument — numbers, labels, navigation, actions.
**Newsreader** is the language — rationales, briefs, parent reports, prose. When
you are reading a measurement you are reading Archivo; when you are reading a
judgement you are reading Newsreader.

The chart's y-axis is a real printed value scale, because that is the unit the
whole product is denominated in. The five dimensions are drawn in five pencil
grades with five stroke patterns rather than five colours.

Motion answers actions and shows what changed. There is one orchestrated page-load
moment, on the landing hero, and no fade-and-slide-up on section scroll anywhere.
`prefers-reduced-motion` is honoured throughout.

---

## What it cannot do

A model looking at a photograph of a drawing can tell you how far apart the
darkest and lightest values are, and it can be wrong about almost everything else.
On an ambiguous work — a deliberate stylistic choice, an unusual medium, a bad
photograph — its proposals are unreliable, and it says so by lowering its own
confidence.

So the product never puts a number on a student without a human agreeing to it.

The seeded students and their works are generated, because real student drawings
are not ours to publish. Everything the product does with them is the real
pipeline: the same scoring path, the same anchors in the prompt, the same plateau
arithmetic, the same confirm-and-override rules.

## Scope

Finished and working end to end: calibration, scoring with confirm and override,
the trajectory, plateau detection and cohort triage, assignment generation, and
the parent report.

Deliberately not built: multi-instructor accounts, a PDF export pipeline (the
report prints to A4 and that is enough), and assignment completion tracking.

Everything else in the product is reachable from the interface. There are no
server actions without a control that calls them: reports and assignment drafts
are editable before they are issued, a work scored from the pixels can be put
back to the model without touching anything already confirmed, a student's name,
level and status can be changed, alerts can be dismissed, and the measurements
behind any score can be opened and read.
