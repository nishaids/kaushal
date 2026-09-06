import Link from 'next/link'
import type { Metadata } from 'next'
import { HeroTrajectory } from '@/components/landing/hero-trajectory'
import { Loop } from '@/components/landing/loop'
import { CalibrationDemo } from '@/components/landing/calibration-demo'
import { CountUp } from '@/components/landing/counters'
import { StudySwatch } from '@/components/landing/study-swatch'
import { ButtonLink } from '@/components/ui/button'
import { Wordmark } from '@/components/ui/value-scale'
import { ScoreMark } from '@/components/ui/score-mark'
import { DIMENSION_LIST } from '@/lib/rubric'
import { PLATEAU } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'KAUSHAL — progress tracking for skill-based teaching',
  description:
    'One instructor, sixty students, work that cannot be marked. KAUSHAL scores photographed student work across five visual dimensions, the instructor confirms every number, and the trajectory shows which part stopped moving.',
}

export default function LandingPage() {
  return (
    <div className="tooth relative min-h-dvh bg-v1">
      <TopNav />

      <main id="main">
        <Hero />
        <Problem />
        <LoopSection />
        <Calibration />
        <Rubric />
        <Evidence />
        <Limitation />
      </main>

      <SiteFooter />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-v3 bg-v1/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[76rem] items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link href="/" className="rounded-[2px]" aria-label="KAUSHAL home">
          <Wordmark size={17} />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          <Link
            href="#calibration"
            className="hidden rounded-[2px] px-3 py-2 text-xs text-v6 transition-colors hover:text-v9 sm:block"
          >
            Calibration
          </Link>
          <Link
            href="#rubric"
            className="hidden rounded-[2px] px-3 py-2 text-xs text-v6 transition-colors hover:text-v9 sm:block"
          >
            The five dimensions
          </Link>
          <Link
            href="#limits"
            className="hidden rounded-[2px] px-3 py-2 text-xs text-v6 transition-colors hover:text-v9 sm:block"
          >
            What it cannot do
          </Link>
          <ButtonLink href="/demo" variant="ink" size="sm">
            Open the demo
          </ButtonLink>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="border-b border-v3">
      <div className="mx-auto max-w-[76rem] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col justify-center">
            <h1 className="text-3xl leading-[1.03] text-v9 sm:text-4xl">
              Six works.
              <br />
              Fourteen weeks.
              <br />
              One dimension that stopped.
            </h1>
            <p className="font-language mt-6 max-w-[46ch] text-lg leading-relaxed text-v7">
              KAUSHAL measures how a student in an art, craft or vocational
              programme is actually improving — one photographed work at a time.
              The instructor confirms every number. Nothing is recorded until
              they do.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/demo" variant="ink" size="lg">
                Open the live demo
              </ButtonLink>
              <ButtonLink href="#calibration" variant="outline" size="lg">
                How calibration works
              </ButtonLink>
            </div>
            <p className="mt-5 max-w-[42ch] text-xs text-v5">
              The demo is a seeded academy with sixty-two students. It resets to
              a known state in one click, so nothing you press can break it.
            </p>
          </div>

          <div className="lg:pt-2">
            <HeroTrajectory />
          </div>
        </div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="border-b border-v3 bg-v0">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16">
          <div>
            <h2 className="max-w-[18ch] text-2xl text-v9 sm:text-3xl">
              Skill-based education has no gradebook.
            </h2>
            <div className="font-language mt-6 max-w-[62ch] space-y-4 text-lg leading-relaxed text-v7">
              <p>
                In art, music, dance, craft and vocational training, students
                produce work rather than answers. There are no marks, no multiple
                choice, no submission log. Whatever the instructor knows about a
                student lives in the instructor’s head.
              </p>
              <p>
                That works for eight students. It does not work for sixty. A
                plateau in one skill is invisible for months, and by the time it
                is obvious, the student has already decided they are not getting
                anywhere.
              </p>
              <p className="text-v9">
                Students quit skill programmes not because they stopped
                improving, but because nobody could see that they had.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px self-start border border-v3 bg-v3">
            <Figure
              value={<CountUp to={62} />}
              label="students enrolled at the academy this was built inside"
            />
            <Figure value={<CountUp to={1} suffix=" hr" />} label="of contact time with each of them per week" />
            <Figure value={<CountUp to={0} />} label="marks, tests or submission logs in the entire discipline" />
            <Figure
              value={
                <>
                  <CountUp to={6} />
                  <span className="text-lg text-v6"> wk</span>
                </>
              }
              label="a plateau can run before anyone notices it by eye"
            />
          </dl>
        </div>
      </div>
    </section>
  )
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="bg-v0 p-5 sm:p-6">
      <div className="numeral text-3xl leading-none text-v9">{value}</div>
      <div className="mt-3 max-w-[24ch] text-xs leading-relaxed text-v6">
        {label}
      </div>
    </div>
  )
}

function LoopSection() {
  return (
    <section className="border-b border-v3">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <h2 className="max-w-[22ch] text-2xl text-v9 sm:text-3xl">
          The whole product is three moves and a loop.
        </h2>
        <p className="font-language mt-4 max-w-[58ch] text-lg text-v6">
          It has to fit in the two minutes after a class ends, or an instructor
          teaching sixty students will never use it twice.
        </p>
        <div className="mt-10 lg:mb-10">
          <Loop />
        </div>
      </div>
    </section>
  )
}

function Calibration() {
  return (
    <section id="calibration" className="scroll-mt-16 border-b border-v3 bg-v0">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <h2 className="max-w-[24ch] text-2xl text-v9 sm:text-3xl">
          Every academy has a different standard. The rubric learns yours.
        </h2>
        <p className="font-language mt-4 max-w-[62ch] text-lg text-v6">
          A generic rubric is worse than no rubric, because it is confidently
          wrong in a way an instructor has to keep correcting. So the first thing
          KAUSHAL asks you to do is score ten of your own past works.
        </p>
        <div className="mt-10">
          <CalibrationDemo />
        </div>
      </div>
    </section>
  )
}

function Rubric() {
  return (
    <section id="rubric" className="scroll-mt-16 border-b border-v3">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="text-2xl text-v9 sm:text-3xl">
              Five dimensions you can point at on the paper.
            </h2>
            <p className="font-language mt-4 max-w-[44ch] text-lg text-v6">
              There is no score for creativity, talent or effort in this product.
              A number nobody can verify by looking at the work would discredit
              the four next to it.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <StudySwatch seed={21} value={7} size={72} />
              <StudySwatch seed={5} value={4} size={72} />
              <ScoreMark value={7} state="confirmed" size="md" />
              <ScoreMark value={4} state="proposed" confidence={0.61} size="md" />
            </div>
          </div>

          <ul className="border border-v3 bg-v0">
            {DIMENSION_LIST.map((spec, i) => (
              <li
                key={spec.id}
                className={
                  'flex items-start gap-4 p-5 sm:p-6' +
                  (i > 0 ? ' border-t border-v3' : '')
                }
              >
                <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" className="mt-2 shrink-0">
                  <line
                    x1="0"
                    y1="6"
                    x2="30"
                    y2="6"
                    stroke={spec.ink}
                    strokeWidth="2.4"
                    strokeDasharray={spec.dash}
                  />
                </svg>
                <div>
                  <h3 className="text-base text-v9">{spec.longLabel}</h3>
                  <p className="font-language mt-1 max-w-[52ch] text-base text-v6">
                    {spec.question}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Evidence() {
  return (
    <section className="border-b border-v3 bg-v0">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="max-w-[20ch] text-2xl text-v9 sm:text-3xl">
              Built inside the problem, not next to it.
            </h2>
            <div className="font-language mt-5 max-w-[56ch] space-y-4 text-lg text-v7">
              <p>
                KAUSHAL is built by the person who runs Krishna Art Academy in
                Chennai — sixty-plus enrolled students, Udyam-registered. Every
                design decision in it answers a problem that shows up on a
                Saturday morning with thirty drawings on a table.
              </p>
              <p>
                That is also why the scope is narrow. Calibration, scoring with
                confirm and override, the trajectory, plateau detection and the
                parent report are finished and work end to end. Nothing else was
                started.
              </p>
            </div>
          </div>

          <dl className="space-y-px border border-v3 bg-v3">
            <Fact
              term="Where the numbers in this demo come from"
              detail="A seeded academy of sixty-two students, generated so the trajectory, plateau detection and cohort triage can be exercised honestly. The student records are synthetic; the workflow they run through is the real one."
            />
            <Fact
              term="How plateau detection works"
              detail={`We fit a straight line through each dimension's last ${PLATEAU.window} works. A dimension is flagged when its line is flat — under ${PLATEAU.flatSlope} points a week — while the other four are still climbing. No model, nothing hidden.`}
            />
            <Fact
              term="What happens when the model is unavailable"
              detail="The image is measured in the browser — value spread, ink coverage, edge variance, mass distribution — and those measurements produce a labelled fallback score with low confidence. The product degrades to something honest rather than to a spinner."
            />
            <Fact
              term="Who owns a score"
              detail="The instructor. Every proposal is stored separately from the confirmed number, overrides are kept, and no unconfirmed score is ever presented as fact anywhere in the product."
            />
          </dl>
        </div>
      </div>
    </section>
  )
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-v0 p-5 sm:p-6">
      <dt className="text-sm text-v9">{term}</dt>
      <dd className="font-language mt-1.5 max-w-[58ch] text-base text-v6">
        {detail}
      </dd>
    </div>
  )
}

function Limitation() {
  return (
    <section id="limits" className="scroll-mt-16 bg-v9 text-v1">
      <div className="mx-auto max-w-[76rem] px-5 py-14 sm:px-8 sm:py-20">
        <h2 className="max-w-[20ch] text-2xl text-v0 sm:text-3xl">
          KAUSHAL cannot grade art, and does not claim to.
        </h2>
        <div className="font-language mt-6 max-w-[64ch] space-y-4 text-lg leading-relaxed text-v3">
          <p>
            A model looking at a photograph of a drawing can tell you how far
            apart the darkest and lightest values are, and it can be wrong about
            almost everything else. On an ambiguous work — a deliberate stylistic
            choice, an unusual medium, a bad photograph — its proposals are
            unreliable, and it says so by lowering its own confidence.
          </p>
          <p className="text-v0">
            So the product never puts a number on a student without a human
            agreeing to it. What KAUSHAL genuinely does is the bookkeeping a
            person teaching sixty students has no time to do: it remembers every
            score, draws the line, and tells you which part stopped moving.
          </p>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-v3 bg-v1">
      <div className="mx-auto flex max-w-[76rem] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <Wordmark size={16} />
          <p className="mt-3 max-w-[44ch] text-xs text-v6">
            The measurement layer for learning that cannot be typed. Built for
            GatewayHacks 2026, Track 2 — Equity in Education.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Footer">
          <Link href="/demo" className="text-v6 underline underline-offset-4 hover:text-v9">
            Live demo
          </Link>
          <Link href="/login" className="text-v6 underline underline-offset-4 hover:text-v9">
            Instructor sign in
          </Link>
          <Link href="#rubric" className="text-v6 underline underline-offset-4 hover:text-v9">
            The five dimensions
          </Link>
          <Link href="#limits" className="text-v6 underline underline-offset-4 hover:text-v9">
            What it cannot do
          </Link>
        </nav>
      </div>
    </footer>
  )
}
