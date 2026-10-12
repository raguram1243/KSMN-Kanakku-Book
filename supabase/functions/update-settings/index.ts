import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, readJson, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

const ALLOWED_KEYS = [
  'overdue_days_walkin',
  'overdue_days_regular',
  'overdue_days_contractor',
  'overdue_days_wholesale',
  'overdue_days_corporate',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    const caller = await requireStaff(req, supabase, 'admin')

    const { updates } = await readJson(req)

    if (!Array.isArray(updates)) {
      throw new HttpError(400, 'Invalid request: updates must be an array')
    }

    // Only the known overdue-days settings may be written, each a whole number of days
    const validated: { key: string; value: string }[] = []
    for (const item of updates) {
      const { key, value } = (item ?? {}) as { key?: unknown; value?: unknown }
      if (typeof key !== 'string' || !ALLOWED_KEYS.includes(key)) {
        throw new HttpError(400, 'Unknown setting')
      }
      const days = Number(value)
      if (value === '' || value === null || !Number.isInteger(days) || days < 1 || days > 3650) {
        throw new HttpError(400, 'Overdue days must be a whole number between 1 and 3650')
      }
      validated.push({ key, value: String(days) })
    }

    // Update each setting
    for (const { key, value } of validated) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value })

      if (error) throw error
    }

    return json(req, { success: true })
  } catch (error) {
    return errorResponse(req, error, 'update-settings')
  }
})
