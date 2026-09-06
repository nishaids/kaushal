'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addStudent } from '@/lib/actions/students'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export function AddStudent() {
  const router = useRouter()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await addStudent(formData)
      if (res.ok) {
        formRef.current?.reset()
        nameRef.current?.focus()
        toast.push({
          message: `${res.data.student.name} is on the roster.`,
          detail: 'Their trajectory begins at their first recorded work.',
        })
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  return (
    <form ref={formRef} action={onSubmit} className="flex flex-wrap items-end gap-4">
      <Field label="Name" htmlFor="student-name" className="min-w-[14rem] flex-1">
        <Input
          ref={nameRef}
          id="student-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Aarav Krishnan"
          autoComplete="off"
        />
      </Field>

      <Field label="Level" htmlFor="student-level" className="w-28">
        <Select id="student-level" name="level" defaultValue="1">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              Level {n}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" variant="ink" busy={pending} busyLabel="Adding">
        Add student
      </Button>

      {error ? (
        <p role="alert" className="w-full text-xs text-v9">
          {error.message}
          {error.hint ? <span className="block text-v6">{error.hint}</span> : null}
        </p>
      ) : null}
    </form>
  )
}
