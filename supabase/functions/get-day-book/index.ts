import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { preflight, json, errorResponse, HttpError } from '../_shared/http.ts'
import { serviceClient, requireStaff } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  try {
    const supabase = serviceClient()
    await requireStaff(req, supabase, 'admin')

    const url = new URL(req.url)
    const dayParam = url.searchParams.get('day')

    // Default to today in Asia/Kolkata (en-CA formats as YYYY-MM-DD)
    const day = dayParam || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00.000Z`) : null
    if (!parsed || isNaN(parsed.getTime()) || parsed.toISOString().split('T')[0] !== day) {
      throw new HttpError(400, 'Invalid day parameter. Expected a valid date in YYYY-MM-DD format')
    }

    const { data, error } = await supabase.rpc('get_day_book_stats', { p_day: day })

    if (error) throw error

    return json(req, data)
  } catch (error) {
    return errorResponse(req, error, 'get-day-book')
  }
})
