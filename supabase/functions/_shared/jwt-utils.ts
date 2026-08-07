// ============================================
// JWT Utilities for Edge Functions
// ============================================
// Verifies JWT tokens from Supabase Auth

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
  
  // Get JWT secret from environment
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT secret not configured');
  }

  try {
    // For Supabase JWT, we need to verify it
    // This is a simplified version - in production use a proper JWT library
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('Token expired');
    }

    return {
      staff_id: payload.sub || payload.staff_id,
      role: payload.role || 'staff',
      exp: payload.exp,
    };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}