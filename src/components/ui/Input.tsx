interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
          error ? 'border-red-500 dark:border-red-500' : ''
        } ${className}`}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}