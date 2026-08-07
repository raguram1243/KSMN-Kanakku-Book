import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('ksmn_token');
    const storedStaff = localStorage.getItem('ksmn_staff');
    debugLog('[Auth] Init - storedToken exists:', !!storedToken, 'storedStaff exists:', !!storedStaff);

    if (storedToken && storedStaff) {
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1])) as JWTPayload;
        const now = Date.now();
        const exp = payload.exp * 1000;
        debugLog('[Auth] Token exp:', new Date(exp).toISOString(), 'now:', new Date(now).toISOString(), 'valid:', exp > now);

        if (exp > now) {
          setToken(storedToken);
          setStaff(JSON.parse(storedStaff));
          debugLog('[Auth] Session restored from localStorage');
        } else {
          debugLog('[Auth] Token expired, clearing');
          localStorage.removeItem('ksmn_token');
          localStorage.removeItem('ksmn_staff');
        }
      } catch (e) {
        debugLog('[Auth] Failed to parse stored session:', e);
        localStorage.removeItem('ksmn_token');
        localStorage.removeItem('ksmn_staff');
      }
    }
    setLoading(false);
  }, []);

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