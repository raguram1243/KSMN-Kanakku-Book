interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100',
    success: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300',
    warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
    danger: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
    info: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}