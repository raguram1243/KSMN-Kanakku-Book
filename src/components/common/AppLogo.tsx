import { useState } from 'react';

interface AppLogoProps {
  /** Height preset — width stays auto so non-square transparent logos never squish. */
  size?: 'sm' | 'md' | 'lg';
  /** `icon`: small mark (nav/sidebar/favicon). `full`: full lockup (login card). */
  variant?: 'icon' | 'full';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 sm:h-8 w-auto',
  md: 'h-8 w-auto',
  lg: 'h-16 w-auto max-w-[220px]',
};

/**
 * Single place that renders the brand logo.
 * - `icon` (default): the "logo only" mark for nav/sidebar/favicon — small, square.
 * - `full`: the full KSMN letterhead lockup for the login card.
 * Keeps aspect ratio (no fixed w-8/w-16) so logos never squish, in both themes.
 */
export function AppLogo({ size = 'md', variant = 'icon', className = '' }: AppLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = variant === 'full' ? '/ksmn-logo-full.jpeg' : '/ksmn-logo-icon.jpeg';
  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-lg bg-primary-600 font-bold text-white ${size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-8 w-8 text-sm'} ${className}`}
        aria-label="KSMN Logo"
      >
        K
      </span>
    );
  }
  return (
    <img
      src={src}
      alt="KSMN Logo"
      width={size === 'lg' ? 220 : 64}
      height={size === 'lg' ? 64 : 32}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${sizeClasses[size]} object-contain flex-shrink-0 ${className}`}
    />
  );
}
