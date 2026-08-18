// ============================================
// JWT Utilities for Edge Functions
// ============================================
// Verifies JWT tokens issued by verify-pin using APP_JWT_SECRET

import { jwtVerify } from 'https://deno.land/x/jose@v5.2.0/index.ts';

export interface TokenPayload {
  staff_id: string;
  role: 'admin' | 'staff';
  exp: number;
}

export async function verifyToken(authHeader: string | null): Promise<TokenPayload> {
  if (!authHeader) {
    throw new Error('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  // Get JWT secret from environment (must match the secret used by verify-pin)
  const jwtSecret = Deno.env.get('APP_JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('APP_JWT_SECRET not configured');
  }

  try {
    // Verify the JWT signature and decode the payload using jose
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(jwtSecret),
    );

    return {
      staff_id: (payload.sub || payload.staff_id) as string,
      role: (payload.role as 'admin' | 'staff') || 'staff',
      exp: payload.exp as number,
    };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}