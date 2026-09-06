'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding } from '@/lib/auth-actions'
import type { Discipline } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ChoiceGroup, Field, Input } from '@/components/ui/field'

const DISCIPLINES: Array<{ value: Discipline; label: string; note?: string }> = [
  { value: 'drawing', label: 'Drawing', note: 'The five dimensions are written for this' },
  { value: 'painting', label: 'Painting' },
  { value: 'sculpture', label: 'Sculpture' },
  { value: 'craft', label: 'Craft' },
  { value: 'other', label: 'Something else' },
]

export function OnboardingForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [discipline, setDiscipline] = useState<Discipline>('drawing')
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    formData.set('discipline', discipline)
    startTransition(async () => {
      const res = await completeOnboarding(formData)
      if (res.ok) {
        router.push('/calibrate')
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  return (
    <form action={onSubmit} className="space-y-7">
      <Field
        label="Academy name"
        htmlFor="academy-name"
        hint="What your students and their parents call it."
      >
        <Input
          id="academy-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Krishna Art Academy"
          autoComplete="organization"
        />
      </Field>

      <Field label="Your name" htmlFor="instructor-name">
        <Input
          id="instructor-name"
          name="instructor_name"
          maxLength={80}
          placeholder="K. Ramesh"
          autoComplete="name"
        />
      </Field>

      <Field
        label="Email"
        htmlFor="instructor-email"
        hint="Used to sign you back in. Nothing is sent to it otherwise."
      >
        <Input
          id="instructor-email"
          name="email"
          type="email"
          placeholder="you@studio.in"
          autoComplete="email"
        />
      </Field>

      <ChoiceGroup
        label="Discipline"
        name="discipline"
        value={discipline}
        onChange={setDiscipline}
        options={DISCIPLINES}
        columns={2}
      />

      {discipline !== 'drawing' ? (
        <p className="max-w-[54ch] text-xs text-v6">
          The five dimensions are written for drawing and drawing-adjacent work.
          They will still track {discipline}, but calibration matters more here —
          your ten anchors are what make them mean something in your studio.
        </p>
      ) : null}

      {error ? (
        <div role="alert">
          <p className="text-sm text-v9">{error.message}</p>
          {error.hint ? <p className="mt-1 text-xs text-v6">{error.hint}</p> : null}
        </div>
      ) : null}

      <Button type="submit" variant="ink" size="lg" busy={pending} busyLabel="Setting up">
        Create the academy
      </Button>
    </form>
  )
}
