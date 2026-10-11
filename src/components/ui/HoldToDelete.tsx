import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import HoldButton from '../reactbits/HoldButton';
import { ButtonProgress } from './ButtonProgress';
import type { ActionStatus } from '../../hooks/useActionProgress';

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
 *
 * Pass `progress` and the button also reports what happened after the hold.
 * Without it the button flashes "Deleted" the instant the hold completes,
 * which is a claim it cannot make — the request has not been answered yet,
 * and a failed delete still read as a successful one. With it, the hold is
 * followed by a progress bar and then either a tick or a visible failure.
 */

/** Matches Button's `danger` variant so the two sit together naturally. */
const REST_RED = '#dc2626' // red-600
const FILL_RED = '#7f1d1d' // red-900

/**
 * HoldButton's own heights per size. The progress overlay replaces the
 * button rather than sitting on top of it, so it has to hold the same
 * height or the dialog jumps when the hold completes.
 */
const HEIGHTS = { sm: 36, md: 44, lg: 52 } as const

interface HoldToDeleteProps {
  /** Resting label, e.g. "Hold to delete". */
  children: string
  /** Shown briefly once the hold completes. */
  doneLabel?: string
  /** Runs when the hold completes. Not called on a tap. */
  onHold: () => void
  /**
   * The state of the delete the hold started, from `useActionProgress`.
   * Omit it to keep the old behaviour, where the hold is the whole story.
   */
  progress?: ActionStatus
  /** The verb shown beside the percentage. */
  progressLabel?: string
  /** Roughly how long this delete takes. */
  progressExpectedMs?: number
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function HoldToDelete({
  children,
  doneLabel = 'Deleted',
  onHold,
  progress,
  progressLabel = 'Deleting',
  progressExpectedMs = 1200,
  disabled = false,
  size = 'md',
  className = '',
}: HoldToDeleteProps) {
  /*
   * A failure has to clear itself. `useActionProgress` holds `error` until
   * the next attempt, but the overlay covers the button the user would have
   * to hold to make that attempt, so leaving it up would trap them. Show the
   * failure long enough to be read, then hand the button back; the toast the
   * caller raises is the lasting record.
   */
  const [failedVisible, setFailedVisible] = useState(false)
  useEffect(() => {
    if (progress !== 'error') return
    setFailedVisible(true)
    const id = setTimeout(() => setFailedVisible(false), 1800)
    return () => clearTimeout(id)
  }, [progress])

  const overlay =
    progress === 'running' || progress === 'done' ? progress : progress === 'error' && failedVisible ? 'error' : null

  if (overlay) {
    return (
      <div className={`relative inline-flex rounded-lg overflow-hidden bg-red-600 ${className}`} style={{ minHeight: HEIGHTS[size] }}>
        <ButtonProgress
          status={overlay}
          label={progressLabel}
          variant="danger"
          size={size}
          expectedMs={progressExpectedMs}
          icon={<Trash2 size={size === 'lg' ? 16 : 14} />}
        />
      </div>
    )
  }

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
