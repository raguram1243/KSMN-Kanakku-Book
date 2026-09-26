import { useToastStore } from '../../store/toastStore';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

const toastIcons = {
  success: CheckCircle2,
  error: X,
  warning: AlertTriangle,
  info: Info,
};

const toastColors = {
  success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200',
  error: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200',
  warning: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200',
  info: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-800 dark:text-blue-200',
};

const iconColors = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-blue-600 dark:text-blue-400',
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[200] flex flex-col gap-2"
      style={{
        bottom: 'env(safe-area-inset-bottom, 24px)',
        left: 0,
        right: 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div className="w-full max-w-sm space-y-2 px-4 sm:items-end sm:max-w-xs sm:ml-auto">
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.type];
          return (
            <div
              key={toast.id}
              className={`toast-enter flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
                toastColors[toast.type]
              }`}
            >
              <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconColors[toast.type]}`} />
              <div className="flex-1 space-y-0.5">
                <div className="font-medium">{toast.title}</div>
                {toast.description && (
                  <div className="text-xs opacity-90">{toast.description}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity focus-ring"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
    );
}

