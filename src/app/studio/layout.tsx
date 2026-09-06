import { db } from '@/lib/dal'
import { requireCalibrated } from '@/lib/session'
import { StudioNav, StudioTopBar } from '@/components/shell/studio-nav'
import { ToastProvider } from '@/components/ui/toast'

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireCalibrated()
  const driver = await db()

  // How many works are sitting unconfirmed. The instructor should be able to
  // see that number without going looking for it.
  let pending = 0
  try {
    pending = await driver.countUnconfirmed(session.academy.id)
  } catch {
    pending = 0
  }

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <StudioTopBar academyName={session.academy.name} />
        <StudioNav
          academyName={session.academy.name}
          instructorName={session.instructor.name}
          pendingCount={pending}
        />
        <main id="main" className="min-w-0 flex-1 pb-20 lg:pb-0">
          {children}
        </main>
      </div>
    </ToastProvider>
  )
}
