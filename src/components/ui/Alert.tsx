import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

const variantStyles: Record<AlertVariant, {
  container: string;
  icon: typeof AlertCircle;
  iconClass: string;
  titleClass: string;
}> = {
  error: {
    container: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200',
    icon: AlertCircle,
    iconClass: 'text-red-600 dark:text-red-400',
    titleClass: 'text-red-900 dark:text-red-100',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200',
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
    titleClass: 'text-amber-900 dark:text-amber-100',
  },
  success: {
    container: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200',
    icon: CheckCircle,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    titleClass: 'text-emerald-900 dark:text-emerald-100',
  },
  info: {
    container: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-200',
    icon: Info,
    iconClass: 'text-blue-600 dark:text-blue-400',
    titleClass: 'text-blue-900 dark:text-blue-100',
  },
};

export function Alert({
  variant = 'error',
  title,
  children,
  className = '',
  onClose,
}: AlertProps) {
  const conf = variantStyles[variant];
  const Icon = conf.icon;

  return (
    <div
      role="alert"
      className={`relative flex items-start gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${conf.container} ${className}`}
    >
      <Icon size={18} className={`flex-shrink-0 mt-0.5 ${conf.iconClass}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && <div className={`font-semibold mb-0.5 ${conf.titleClass}`}>{title}</div>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 -mr-1 -mt-0.5 rounded transition-colors focus-ring"
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
