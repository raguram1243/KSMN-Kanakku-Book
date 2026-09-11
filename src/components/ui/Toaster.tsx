import { useToastStore } from '../../store/toastStore';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

const toastIcons = {
  success: CheckCircle2,
  error: X,
  warning: AlertTriangle,
  info: Info,
};

const toastColors = {
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
};

const iconColors = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
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
                className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity"
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

