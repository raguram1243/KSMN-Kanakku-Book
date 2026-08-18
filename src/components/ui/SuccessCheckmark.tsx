import { Check } from 'lucide-react';

interface SuccessCheckmarkProps {
  /** Size of the checkmark circle in pixels */
  size?: number;
  className?: string;
  /** Label announced to screen readers */
  label?: string;
}

/**
 * Subtle success checkmark animation:
 *   1. circle fades / scales in (~250ms)
 *   2. check mark draws in (~250ms, staggered)
 * ~450ms total, no bounce. Uses global CSS keyframes from index.css
 * (`.checkmark-circle`, `.checkmark-path`) so no inline <style> needed.
 */
export function SuccessCheckmark({ size = 48, className = '', label = 'Success' }: SuccessCheckmarkProps) {
  return (
    <svg
      viewBox="0 0 52 52"
      fill="none"
      className={`mx-auto mb-2 flex-shrink-0 text-green-600 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* Outer circle (scales in) */}
            <circle
        cx="26"
        cy="26"
        r="23"
        fill="currentColor"
        className="checkmark-circle"
        style={{ fill: '#dcfce7' }}
      />
      {/* Check mark (draws via stroke-dashoffset) */}
      <path
        d="M16 26.5l6 6 14-14"
        stroke="#16a34a"
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset="24"
        className="checkmark-path"
      />
    </svg>
  );
}

// Re-export Check for callers that want an inline icon variant
export { Check };


