// ============================================
// HTTP helpers shared by every edge function
// ============================================
// CORS, JSON responses and error handling in one place, so no function leaks
// raw database errors or answers to arbitrary websites.

// Origins allowed to call the functions from a browser. Override with the
// ALLOWED_ORIGINS secret (comma separated) if the site moves or gets a custom
// domain:  supabase secrets set ALLOWED_ORIGINS=https://a.example,https://b.example
const DEFAULT_ALLOWED_ORIGINS = [
  'https://ksmn-kanakku-book.web.app',
  'https://ksmn-kanakku-book.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins(): string[] {
  const fromEnv = Deno.env.get('ALLOWED_ORIGINS')
  if (!fromEnv) return DEFAULT_ALLOWED_ORIGINS
  return fromEnv.split(',').map((o) => o.trim()).filter(Boolean)
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/** Answer a CORS preflight. Call first thing: `if (req.method === 'OPTIONS') return preflight(req)`. */
export function preflight(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) })
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/**
 * An error whose message is safe to show the user. Throw it for validation
 * failures (400), auth failures (401/403), missing rows (404) and conflicts (409).
 */
export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Turn anything thrown into a response.
 * - HttpError: its own status and message.
 * - Postgres RAISE EXCEPTION from our own SQL functions (code P0001): those
 *   messages are written for the user (e.g. "Allocation is more than the
 *   outstanding balance"), so they go out as 400.
 * - Anything else: logged server-side, generic 500 to the client. Raw database
 *   and library messages never reach the browser.
 */
export function errorResponse(req: Request, error: unknown, context = 'request'): Response {
  if (error instanceof HttpError) {
    return json(req, { error: error.message }, error.status)
  }
  const e = error as { code?: string; message?: string }
  if (e && e.code === 'P0001' && typeof e.message === 'string') {
    return json(req, { error: e.message }, 400)
  }
  console.error(`[${context}] unexpected error:`, error)
  return json(req, { error: 'Something went wrong. Please try again.' }, 500)
}

/** Parse a JSON body, turning malformed input into a 400 instead of a 500. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') throw new Error('not an object')
    return body as T
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
}
