'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/**
 * Confirmations, not celebrations. A toast in KAUSHAL states what changed and
 * gets out of the way. Everything announced here is also announced to screen
 * readers through a polite live region.
 */

export interface Toast {
  id: string
  message: string
  detail?: string
  tone?: 'plain' | 'guide'
  /** An undo or a follow-on step. One action, never two. */
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  push: (t: Omit<Toast, 'id'>) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // A component outside the provider should not crash the page it is on.
    return { push: () => undefined }
  }
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const reduce = useReducedMotion()

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 5200)
  }, [])

  const api = useMemo(() => ({ push }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
              className={
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[2px] border px-4 py-3 ' +
                (t.tone === 'guide'
                  ? 'border-dashed border-blue-ink bg-blue-wash text-blue-deep'
                  : 'border-v9 bg-v9 text-v1')
              }
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t.message}</p>
                {t.detail ? (
                  <p
                    className={
                      'mt-0.5 text-xs ' +
                      (t.tone === 'guide' ? 'text-blue-deep' : 'text-v3')
                    }
                  >
                    {t.detail}
                  </p>
                ) : null}
              </div>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick()
                    setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  }}
                  className={
                    'shrink-0 rounded-[2px] px-2 py-1 text-xs underline underline-offset-2 ' +
                    (t.tone === 'guide' ? 'text-blue-deep' : 'text-v0')
                  }
                >
                  {t.action.label}
                </button>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}
