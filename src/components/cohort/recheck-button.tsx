'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshCohortAlerts } from '@/lib/actions/alerts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { pluralise } from '@/lib/utils/format'

/**
 * Detection is transparent and cheap, but running it across sixty-two students
 * on every page load would make the screen slow for no reason — the answer only
 * changes when a score changes. So the instructor runs it, and can see when.
 */
export function RecheckButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="outline"
        busy={pending}
        busyLabel="Checking"
        onClick={() =>
          startTransition(async () => {
            setFailed(false)
            try {
              const { flagged } = await refreshCohortAlerts()
              toast.push({
                message:
                  flagged === 0
                    ? 'Checked. Nothing is stalled.'
                    : `${pluralise(flagged, 'student')} carrying a flag.`,
                detail: 'We refit the line through every student’s last four works.',
              })
              router.refresh()
            } catch {
              setFailed(true)
            }
          })
        }
      >
        Re-run the checks
      </Button>
      {failed ? (
        <p role="alert" className="mt-1 max-w-[22rem] text-right text-2xs text-v9">
          The checks did not finish. Nothing was changed — try again.
        </p>
      ) : null}
    </div>
  )
}
