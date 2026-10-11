import HoldButton from '../reactbits/HoldButton';

/**
 * The last step of a delete: hold instead of click.
 *
 * Every destructive flow in the app ends with one of these. A single click is
 * too easy to make by accident on a ledger where a delete cannot be undone —
 * holding for two seconds is a deliberate act, and the fill sweeping across
 * shows how far through you are and lets you abandon it by letting go.
 *
 * Colours deliberately match the existing danger button (`bg-red-600`, which
 * has no dark-mode variant), so this reads as the same button it replaces in
 * both themes. The fill is red-900 — clearly deeper, still unmistakably a
 * destructive action rather than a progress bar.
 */

/** Matches Button's `danger` variant so the two sit together naturally. */
const REST_RED = '#dc2626' // red-600
const FILL_RED = '#7f1d1d' // red-900

interface HoldToDeleteProps {
  /** Resting label, e.g. "Hold to delete". */
  children: string
  /** Shown briefly once the hold completes. */
  doneLabel?: string
  /** Runs when the hold completes. Not called on a tap. */
  onHold: () => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function HoldToDelete({
  children,
  doneLabel = 'Deleted',
  onHold,
  disabled = false,
  size = 'md',
  className = '',
}: HoldToDeleteProps) {
  return (
    <HoldButton
      doneLabel={doneLabel}
      backgroundColor={REST_RED}
      fillColor={FILL_RED}
      textColor="#ffffff"
      fillTextColor="#ffffff"
      size={size}
      radius={8}
      fillDirection="right"
      holdTime={2000}
      releaseTime={200}
      pressScale={0.97}
      wave
      waveAmplitude={6}
      glow
      resetAfter={1200}
      disabled={disabled}
      onHold={onHold}
      className={className}
    >
      {children}
    </HoldButton>
  )
}
