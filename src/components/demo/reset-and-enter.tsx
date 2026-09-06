'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { enterDemo } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

/**
 * The button the demo runs on.
 *
 * It reports the actual steps rather than spinning, and a failed reset never
 * blocks entry — the worst case is an academy that is slightly out of shape,
 * which is a great deal better than a stage with nothing on it.
 */

type Step = { label: string; state: 'waiting' | 'doing' | 'done' | 'failed' }

const INITIAL: Step[] = [
  { label: 'Rebuilding the seeded academy', state: 'waiting' },
  { label: 'Signing in as the instructor', state: 'waiting' },
]

export function ResetAndEnter() {
  const reduce = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [note, setNote] = useState<string | null>(null)

  function run(reset: boolean) {
    setNote(null)
    setSteps(reset ? INITIAL.map((s) => ({ ...s })) : [INITIAL[1]])

    startTransition(async () => {
      if (reset) {
        setSteps((s) => mark(s, 0, 'doing'))
        try {
          const res = await fetch('/api/demo/reset', { method: 'POST' })
          const body = (await res.json().catch(() => null)) as
            | { ok?: boolean; students?: number; works?: number; hint?: string }
            | null

          if (res.ok && body?.ok) {
            setSteps((s) => mark(s, 0, 'done'))
            setNote(
              typeof body.students === 'number'
                ? `${body.students} students and ${body.works ?? 0} works rebuilt.`
                : null,
            )
          } else {
            setSteps((s) => mark(s, 0, 'failed'))
            setNote(
              body?.hint ??
                'The reset did not run. Entering the academy as it stands.',
            )
          }
        } catch {
          setSteps((s) => mark(s, 0, 'failed'))
          setNote('The reset did not run. Entering the academy as it stands.')
        }
      }

      setSteps((s) => mark(s, reset ? 1 : 0, 'doing'))
      // enterDemo redirects, which works by throwing. Nothing after it runs.
      await enterDemo()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ink"
          size="lg"
          busy={pending}
          busyLabel="Preparing"
          onClick={() => run(true)}
        >
          Reset and enter the demo
        </Button>
        <Button variant="outline" size="lg" disabled={pending} onClick={() => run(false)}>
          Enter without resetting
        </Button>
      </div>

      <AnimatePresence>
        {steps ? (
          <motion.ul
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="mt-5 space-y-2 overflow-hidden"
            aria-live="polite"
          >
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-xs">
                <span
                  className={cn(
                    'inline-block h-2.5 w-2.5 shrink-0 border',
                    s.state === 'done' && 'border-v9 bg-v9',
                    s.state === 'doing' && 'border-blue-ink bg-blue-wash',
                    s.state === 'failed' && 'border-v9 bg-v0',
                    s.state === 'waiting' && 'border-v4 bg-transparent',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    s.state === 'waiting' ? 'text-v5' : 'text-v7',
                    s.state === 'failed' && 'text-v9',
                  )}
                >
                  {s.label}
                  {s.state === 'failed' ? ' — did not run' : ''}
                </span>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>

      {note ? <p className="mt-3 max-w-[52ch] text-xs text-v6">{note}</p> : null}
    </div>
  )
}

function mark(steps: Step[] | null, index: number, state: Step['state']): Step[] | null {
  if (!steps) return steps
  return steps.map((s, i) => (i === index ? { ...s, state } : s))
}
