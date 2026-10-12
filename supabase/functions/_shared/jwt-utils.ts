// ============================================
// JWT Utilities for Edge Functions
// ============================================
// Verifies JWT tokens issued by verify-pin using APP_JWT_SECRET.
//
// This only proves the token was signed by us and has not expired. It does NOT
// prove the staff member still exists, is active, or still has the role in the
// token — use requireStaff() from ./auth.ts for that, which every function
// except verify-pin must call.

import { jwtVerify } from 'https://deno.land/x/jose@v5.2.0/index.ts';

export interface TokenPayload {
  staff_id: string;
  role: 'admin' | 'staff';
  iat: number;
  exp: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyToken(authHeader: string | null): Promise<TokenPayload> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }

  const token = authHeader.slice('Bearer '.length);

  // Get JWT secret from environment (must match the secret used by verify-pin)
  const jwtSecret = Deno.env.get('APP_JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('APP_JWT_SECRET not configured');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      algorithms: ['HS256'],
    }));
  } catch {
    throw new Error('Invalid or expired token');
  }

  // A token we issued always carries a staff uuid, a known role and iat.
  // Anything else (for example a Supabase anon/service key, should the two
  // secrets ever be the same) is rejected here.
  const staffId = payload.staff_id;
  const role = payload.role;
  if (typeof staffId !== 'string' || !UUID_RE.test(staffId)) {
    throw new Error('Invalid or expired token');
  }
  if (role !== 'admin' && role !== 'staff') {
    throw new Error('Invalid or expired token');
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('Invalid or expired token');
  }

  return { staff_id: staffId, role, iat: payload.iat, exp: payload.exp };
}
