interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200/80 dark:border-gray-800 ring-1 ring-black/[0.03] dark:ring-white/[0.04] p-4 sm:p-5 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 transition-all' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}