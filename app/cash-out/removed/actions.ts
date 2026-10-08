'use server'

import { revalidatePath } from 'next/cache'
import { restoreRecord } from '@/lib/remove-record'

export type RestoreResult = { ok: boolean; message: string } | null

/** Put a removed receipt back, under its original record number. */
export async function putBack(_prev: RestoreResult, form: FormData): Promise<RestoreResult> {
  const res = await restoreRecord(Number(form.get('id')))
  if (res.ok) {
    revalidatePath('/cash-out'); revalidatePath('/cash-out/removed')
    revalidatePath('/stock'); revalidatePath('/')
  }
  return res
}
