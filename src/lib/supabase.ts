import { createClient } from '@supabase/supabase-js';
import { isSessionExpired } from './utils';
import { JWTPayload } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('ksmn_token');
  if (!token) return {};
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as JWTPayload;
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('ksmn_token');
      localStorage.removeItem('ksmn_staff');
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
      'X-User-Role': payload.role,
      'X-User-Id': payload.staff_id,
    };
  } catch {
    return {};
  }
}

export async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const headers = getAuthHeaders();
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      ...headers,
      ...options.headers,
    },
  });
  
  if (response.status === 401 && isSessionExpired()) {
    localStorage.removeItem('ksmn_token');
    localStorage.removeItem('ksmn_staff');
    window.location.href = '/login';
  }
  
  return response;
}