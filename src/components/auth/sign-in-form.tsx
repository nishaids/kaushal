'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmail } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

/**
 * Two paths behind one field.
 *
 * With Supabase configured this sends a magic link. Without it, KAUSHAL creates
 * a local session so the product is usable with no auth provider at all. The
 * form says plainly which of the two happened rather than pretending they are
 * the same thing.
 */
export function SignInForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    setSent(null)
    const email = String(formData.get('email') ?? '')
    startTransition(async () => {
      const res = await signInWithEmail(formData)
      if (!res.ok) {
        setError({ message: res.error, hint: res.hint })
        return
      }
      if (res.data.sent) {
        setSent(email)
      } else {
        router.push('/studio')
        router.refresh()
      }
    })
  }

  if (sent) {
    return (
      <div className="border-l-2 border-v9 bg-v0 p-5">
        <h2 className="text-base text-v9">Check {sent}</h2>
        <p className="font-language mt-2 max-w-[52ch] text-base text-v6">
          A sign-in link is on its way. Open it on this device and you will land
          in your academy. The link is good for one use.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-3 text-xs text-v6 underline underline-offset-2 hover:text-v9"
        >
          Use a different address
        </button>
      </div>
    )
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <Field
        label="Email"
        htmlFor="signin-email"
        hint="The address your academy is registered to."
        error={error?.message}
      >
        <Input
          id="signin-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@studio.in"
        />
      </Field>

      {error?.hint ? <p className="text-xs text-v6">{error.hint}</p> : null}

      <Button type="submit" variant="outline" busy={pending} busyLabel="Sending">
        Send me a sign-in link
      </Button>
    </form>
  )
}
