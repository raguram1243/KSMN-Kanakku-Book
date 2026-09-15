import { createContext, useContext, useState, ReactNode } from 'react';
import { Staff, JWTPayload } from '../types';
import { debugLog } from '../lib/utils';

interface AuthContextType {
  staff: Staff | null;
  token: string | null;
  login: (token: string, staff: Staff) => void;
  logout: () => void;
  isAdmin: boolean;
  isStaff: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Reads the saved session synchronously, so the very first render already
 * knows who is signed in. This used to happen in a useEffect: the whole app
 * rendered once with no user and a "Loading..." screen, then again after the
 * effect set token, staff and loading - a guaranteed extra render of every
 * route on every page load.
 */
function readStoredSession(): { token: string; staff: Staff } | null {
  const storedToken = localStorage.getItem('ksmn_token');
  const storedStaff = localStorage.getItem('ksmn_staff');
  debugLog('[Auth] Init - storedToken exists:', !!storedToken, 'storedStaff exists:', !!storedStaff);
  if (!storedToken || !storedStaff) return null;

  try {
    const payload = JSON.parse(atob(storedToken.split('.')[1])) as JWTPayload;
    if (payload.exp * 1000 > Date.now()) {
      debugLog('[Auth] Session restored from localStorage');
      return { token: storedToken, staff: JSON.parse(storedStaff) };
    }
    debugLog('[Auth] Token expired, clearing');
  } catch (e) {
    debugLog('[Auth] Failed to parse stored session:', e);
  }
  localStorage.removeItem('ksmn_token');
  localStorage.removeItem('ksmn_staff');
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState(readStoredSession);
  const [staff, setStaff] = useState<Staff | null>(initialSession?.staff ?? null);
  const [token, setToken] = useState<string | null>(initialSession?.token ?? null);
  // Kept for consumers; the session is resolved before the first render now.
  const loading = false;

  const login = (newToken: string, newStaff: Staff) => {
    debugLog('[Auth] login() called with staff:', newStaff.name, 'role:', newStaff.role);
    localStorage.setItem('ksmn_token', newToken);
    localStorage.setItem('ksmn_staff', JSON.stringify(newStaff));
    setToken(newToken);
    setStaff(newStaff);
    debugLog('[Auth] State updated, token and staff set');
  };

  const logout = () => {
    debugLog('[Auth] logout() called');
    localStorage.removeItem('ksmn_token');
    localStorage.removeItem('ksmn_staff');
    setToken(null);
    setStaff(null);
  };

  const isAdmin = staff?.role === 'admin';
  const isStaff = staff?.role === 'staff';

  return (
    <AuthContext.Provider value={{ staff, token, login, logout, isAdmin, isStaff, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}