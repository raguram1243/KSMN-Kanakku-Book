import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { ButtonProgress } from './ButtonProgress';
import type { ActionStatus } from '../../hooks/useActionProgress';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  loading?: boolean;
  /**
   * Opt in to a progress bar inside the button instead of the spinner, for
   * the actions worth watching — the ones that write to the ledger. Drive it
   * with `useActionProgress`, which reports success and failure as well as
   * the wait; the spinner can only say "wait".
   *
   * `loading` still governs whether the button is disabled, so a button with
   * progress passes both.
   */
  progress?: ActionStatus;
  /** The verb shown beside the percentage, e.g. "Saving". Defaults to "Saving". */
  progressLabel?: string;
  /** Roughly how long this action takes; the bar paces itself against it. */
  progressExpectedMs?: number;
  /** Optional glyph for the bar; it rolls to a tick on success. */
  progressIcon?: ReactNode;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  className = '', 
  loading = false,
  progress,
  progressLabel = 'Saving',
  progressExpectedMs = 1200,
  progressIcon,
  disabled,
  ...props 
}: ButtonProps) {
  // `idle` means there is nothing to show, so fall back to the spinner. The
  // narrowing matters: ButtonProgress takes the three live states only.
  const activeProgress = progress && progress !== 'idle' ? progress : undefined;
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-offset-white dark:ring-offset-gray-900 disabled:opacity-60 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 focus:ring-primary-500 shadow-sm hover:shadow',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 dark:active:bg-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus:ring-red-500 shadow-sm hover:shadow',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-500 dark:text-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700',
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs sm:text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base sm:px-6 sm:py-3',
  };

  // The progress bar is laid over the button, so the button has to clip it and
  // be a positioning context. The label underneath stays in the flow, just
  // invisible, which holds the button's width steady while the bar runs.
  const progressClasses = activeProgress ? 'relative overflow-hidden' : '';

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${progressClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {activeProgress ? (
        <>
          <span className="invisible">{children}</span>
          <ButtonProgress
            status={activeProgress}
            label={progressLabel}
            variant={variant}
            size={size}
            expectedMs={progressExpectedMs}
            icon={progressIcon}
          />
        </>
      ) : loading ? (
        <>
          <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}