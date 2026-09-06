'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Student, StudentStatus } from '@/lib/types'
import { updateStudentAction } from '@/lib/actions/students'
import { Button } from '@/components/ui/button'
import { ChoiceGroup, Field, Input, Select } from '@/components/ui/field'
import { Panel } from '@/components/ui/panel'
import { useToast } from '@/components/ui/toast'

/**
 * Changing a student's name, level or status.
 *
 * Status matters more than it looks: a paused student keeps their whole record
 * and their trajectory, but stops being counted as someone who has gone quiet.
 * Without that, every student who takes a term off sits at the top of the
 * triage list telling the instructor about something they already know.
 */
export function StudentSettings({
  student,
  open,
  onClose,
}: {
  student: Student
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(student.name)
  const [level, setLevel] = useState(student.level)
  const [status, setStatus] = useState<StudentStatus>(student.status)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateStudentAction({
        studentId: student.id,
        name,
        level,
        status,
      })
      if (res.ok) {
        toast.push({ message: 'Saved.' })
        onClose()
        router.refresh()
      } else {
        setError({ message: res.error, hint: res.hint })
      }
    })
  }

  return (
    <Panel
      open={open}
      onClose={onClose}
      title={`Edit ${student.name}`}
      description="Their recorded works and confirmed scores are not touched by anything here."
      width="md"
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="ink" busy={pending} busyLabel="Saving" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Field label="Name" htmlFor="student-edit-name">
          <Input
            id="student-edit-name"
            value={name}
            maxLength={80}
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field
          label="Level"
          htmlFor="student-edit-level"
          hint="Used as context in the scoring prompt and when a brief is drafted."
        >
          <Select
            id="student-edit-level"
            value={level}
            disabled={pending}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Level {n}
              </option>
            ))}
          </Select>
        </Field>

        <ChoiceGroup
          label="Status"
          name="student-status"
          value={status}
          onChange={setStatus}
          columns={1}
          options={[
            {
              value: 'active',
              label: 'Active',
              note: 'Counted in triage, and flagged if they go quiet',
            },
            {
              value: 'paused',
              label: 'Paused',
              note: 'Keeps their record, stops the dormant flag',
            },
            {
              value: 'left',
              label: 'Left the academy',
              note: 'Hidden from the capture picker, record kept',
            },
          ]}
        />

        {error ? (
          <div role="alert">
            <p className="text-sm text-v9">{error.message}</p>
            {error.hint ? (
              <p className="mt-1 text-xs text-v6">{error.hint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
