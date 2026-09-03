import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { debugLog } from '../lib/utils';

export function LoginPage() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      debugLog('[Login] Calling verify-pin edge function');
      const response = await api.verifyPin(name, pin);

      debugLog('[Login] Edge function response status:', response.status);
      const data = await response.json();
      debugLog('[Login] Edge function response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      debugLog('[Login] Calling login() with token and staff');
      login(data.token, data.staff);
      debugLog('[Login] Navigating to /dashboard');
      navigate('/dashboard');
    } catch (err) {
      debugLog('[Login] Error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <img src="/KSMN_logo.png" alt="KSMN Logo" className="mx-auto h-16 w-16 object-contain" />
          <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">KSMN Kanakku-Book</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Credit Ledger Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            <Input
              label="Staff Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
              autoComplete="username"
            />

            <Input
              label="PIN"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              required
              autoComplete="current-password"
              maxLength={20}
            />

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          KSM Nataraja Nadar Firm
        </p>
      </div>
    </div>
  );
}