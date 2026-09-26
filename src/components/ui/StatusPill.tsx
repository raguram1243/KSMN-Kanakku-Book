export type StatusType = 'paid' | 'partial' | 'unpaid' | 'pending' | 'overdue' | 'active' | 'inactive';

interface StatusPillProps {
  status: StatusType | string;
  label?: string;
  showDot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const statusMap: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  paid: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60',
    text: 'text-emerald-800 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Paid',
  },
  partial: {
    bg: 'bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60',
    text: 'text-amber-800 dark:text-amber-200',
    dot: 'bg-amber-500',
    label: 'Partial',
  },
  unpaid: {
    bg: 'bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60',
    text: 'text-red-800 dark:text-red-200',
    dot: 'bg-red-500',
    label: 'Unpaid',
  },
  overdue: {
    bg: 'bg-red-100 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60',
    text: 'text-red-800 dark:text-red-200',
    dot: 'bg-red-500 animate-pulse',
    label: 'Overdue',
  },
  pending: {
    bg: 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
    dot: 'bg-gray-400',
    label: 'Pending',
  },
  active: {
    bg: 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60',
    text: 'text-emerald-800 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Active',
  },
  inactive: {
    bg: 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
    label: 'Inactive',
  },
};

const defaultStyle = {
  bg: 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
  text: 'text-gray-700 dark:text-gray-300',
  dot: 'bg-gray-400',
  label: '',
};

export function StatusPill({
  status,
  label,
  showDot = true,
  size = 'md',
  className = '',
}: StatusPillProps) {
  const key = String(status).toLowerCase();
  const conf = statusMap[key] || { ...defaultStyle, label: status };
  const displayLabel = label ?? conf.label;

  const sizeClasses = size === 'sm'
    ? 'text-[11px] px-2 py-0.5'
    : 'text-xs px-2.5 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeClasses} ${conf.bg} ${conf.text} ${className}`}
    >
      {showDot && (
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${conf.dot}`} aria-hidden="true" />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
