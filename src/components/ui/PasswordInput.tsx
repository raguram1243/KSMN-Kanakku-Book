import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
}

/**
 * Password / PIN input with a show/hide eye toggle.
 * Same visual language as `Input.tsx` so all password fields look identical.
 */
export function PasswordInput({ label, error, className = '', ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={`w-full px-3 py-2 pr-11 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            error ? 'border-red-500 dark:border-red-500' : ''
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          title={show ? 'Hide' : 'Show'}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-ring"
          tabIndex={-1}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
