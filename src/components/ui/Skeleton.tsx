// Reusable Skeleton components for loading states

interface SkeletonProps {
  className?: string;
}

/** Base skeleton block with shimmer animation */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`skeleton-shimmer rounded ${className}`} />
  );
}

/** Text line skeleton - configurable width and number of lines */
export function SkeletonText({ 
  lines = 1, 
  className = '',
  width = 'full'
}: { 
  lines?: number; 
  className?: string;
  width?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-2/3' : `w-${width}`}`} 
        />
      ))}
    </div>
  );
}

/** Card-shaped skeleton placeholder - accepts optional children for custom content */
export function SkeletonCard({ className = '', children }: SkeletonProps & { children?: React.ReactNode }) {
  if (children) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        {children}
      </div>
    );
  }
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  );
}

/** Table row skeleton placeholder */
export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-gray-200">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Chart area skeleton placeholder */
export function SkeletonChart({ className = '' }: SkeletonProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <Skeleton className="h-5 w-1/4 mb-4" />
      <div className="flex items-end space-x-1 h-32">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="flex-1" 
          />
        ))}
      </div>
      <div className="flex justify-center space-x-6 mt-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Avatar/circular skeleton placeholder */
export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };
  return <Skeleton className={`${sizeClasses[size]} rounded-full`} />;
}

/** List item skeleton - for recent entries, payments, etc. */
export function SkeletonListItem({ className = '' }: SkeletonProps) {
  return (
    <div className={`flex items-center justify-between py-2 px-3 border-b last:border-b-0 ${className}`}>
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="text-right space-y-1">
        <Skeleton className="h-4 w-16 ml-2" />
      </div>
    </div>
  );
}

/** Button skeleton placeholder */
export function SkeletonButton({ className = '' }: SkeletonProps) {
  return <Skeleton className={`h-10 w-24 rounded-lg ${className}`} />;
}

/** Search bar skeleton placeholder */
export function SkeletonSearchBar({ className = '' }: SkeletonProps) {
  return <Skeleton className={`h-10 w-full max-w-md rounded-lg ${className}`} />;
}