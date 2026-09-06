'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/dal'
import { requireSession } from '@/lib/session'
import { fail, ok, type ActionResult, type Student, type StudentStatus } from '@/lib/types'
import { CALIBRATION_HOLDER_NAME } from '@/lib/constants'

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  level: z.coerce.number().int().min(0).max(10).optional(),
  joinedAt: z.string().optional(),
})

export async function addStudent(formData: FormData): Promise<ActionResult<{ student: Student }>> {
  const parsed = createSchema.safeParse({
    name: formData.get('name'),
    level: formData.get('level') ?? undefined,
    joinedAt: formData.get('joinedAt') ?? undefined,
  })

  if (!parsed.success) {
    return fail(
      'That student was not added.',
      'A name of at least two characters is all that is required.',
      'invalid_input',
    )
  }

  if (parsed.data.name.trim() === CALIBRATION_HOLDER_NAME) {
    return fail(
      'That name is reserved.',
      'KAUSHAL uses it for the calibration set. Pick another name.',
      'reserved_name',
    )
  }

  try {
    const session = await requireSession()
    const driver = await db()
    const student = await driver.createStudent({
      academyId: session.academy.id,
      name: parsed.data.name.trim(),
      level: parsed.data.level ?? 1,
      joinedAt: parsed.data.joinedAt,
    })
    revalidatePath('/studio')
    return ok({ student })
  } catch {
    return fail('That student was not added.', 'Try again in a moment.', 'write_failed')
  }
}

export async function updateStudentAction(input: {
  studentId: string
  name?: string
  level?: number
  status?: StudentStatus
}): Promise<ActionResult<{ student: Student }>> {
  try {
    const session = await requireSession()
    const driver = await db()
    const student = await driver.updateStudent(session.academy.id, input.studentId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.level !== undefined ? { level: input.level } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    revalidatePath('/studio')
    revalidatePath(`/studio/students/${input.studentId}`)
    return ok({ student })
  } catch {
    return fail('That change did not save.', 'Try again in a moment.', 'write_failed')
  }
}
