import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';
import CallChip from '../reactbits/CallChip';
import type { CallChipStatus } from '../reactbits/CallChip';
import './ButtonProgress.css';

/**
 * The progress bar that runs inside a Button while it is saving.
 *
 * React Bits' CallChip in our colours, stretched across the button (see
 * ButtonProgress.css). It replaces the spinner on the buttons that write to
 * the ledger, so the wait reads as "something is happening and it is nearly
 * done" rather than "something is happening, indefinitely".
 *
 * An honest caveat, worth knowing before trusting the number: this is an
 * ESTIMATE, not measured progress. A fetch gives no completion signal until
 * it finishes, so the fill travels linearly to 90% over `expectedMs` and
 * waits there; the last 10% snaps across the moment the request actually
 * returns. A slow request sits at 90% rather than lying about being finished,
 * and a fast one jumps straight to 100%.
 */

/**
 * Where the fill parks while it waits for the request. Mirrors CallChip's own
 * HOLD_AT constant — the percentage we print has to agree with the bar the
 * user is looking at, and the component does not expose it.
 */
const HOLD_AT = 90

/**
 * Chip `size` per button size. It no longer sets the height (the CSS takes
 * that from the button) but it still derives the font and the icon, as
 * `Math.max(11, Math.round(size * 0.38))`. These three land on 12px, 14px and
 * 16px, matching the text-xs/text-sm/text-base of the button sizes.
 */
const CHIP_SIZE = { sm: 32, md: 37, lg: 42 } as const

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

/**
 * Colours are props rather than classes because CallChip writes them into CSS
 * variables itself, so it cannot follow the `dark` class the way the Tailwind
 * components do — the same reason ThemedSelect carries a palette.
 *
 * On the filled buttons (primary, danger) the wash is white over the button's
 * own colour, and the success and failure tints are the 200-level emerald and
 * red, which stay legible against indigo or red. On the quiet buttons the wash
 * is brand indigo and the tints are full-strength, because they sit on grey.
 */
const PALETTE: Record<Variant, Record<'light' | 'dark', {
  text: string
  progress: string
  progressOpacity: number
  done: string
  error: string
  wash: number
}>> = {
  primary: {
    light: { text: '#ffffff', progress: '#ffffff', progressOpacity: 0.26, done: '#a7f3d0', error: '#fecaca', wash: 0.3 },
    dark: { text: '#ffffff', progress: '#ffffff', progressOpacity: 0.26, done: '#a7f3d0', error: '#fecaca', wash: 0.3 },
  },
  danger: {
    light: { text: '#ffffff', progress: '#ffffff', progressOpacity: 0.26, done: '#a7f3d0', error: '#fee2e2', wash: 0.3 },
    dark: { text: '#ffffff', progress: '#ffffff', progressOpacity: 0.26, done: '#a7f3d0', error: '#fee2e2', wash: 0.3 },
  },
  secondary: {
    light: { text: '#111827', progress: '#4f46e5', progressOpacity: 0.18, done: '#059669', error: '#dc2626', wash: 0.18 },
    dark: { text: '#f3f4f6', progress: '#a5b4fc', progressOpacity: 0.22, done: '#34d399', error: '#f87171', wash: 0.22 },
  },
  ghost: {
    light: { text: '#374151', progress: '#4f46e5', progressOpacity: 0.12, done: '#059669', error: '#dc2626', wash: 0.14 },
    dark: { text: '#e5e7eb', progress: '#a5b4fc', progressOpacity: 0.16, done: '#34d399', error: '#f87171', wash: 0.18 },
  },
}

/**
 * The number beside the bar, counting up in step with it.
 *
 * CallChip animates its fill with a CSS transition and keeps no progress
 * value, so this recomputes the same linear ramp: `elapsed / expectedMs`, to
 * HOLD_AT. It ticks on requestAnimationFrame but only commits a render when
 * the whole number changes, so a 1.2s wait costs about 90 renders of a single
 * `<span>`, not one per frame.
 */
function usePercent(status: CallChipStatus, expectedMs: number) {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    if (status === 'done') {
      setPercent(100)
      return
    }
    // An error holds the bar wherever it got to, so hold the number too.
    if (status !== 'running') {
      if (status === 'idle') setPercent(0)
      return
    }

    setPercent(0)
    const startedAt = performance.now()
    let raf = 0
    let last = 0
    const tick = () => {
      const next = Math.min(HOLD_AT, ((performance.now() - startedAt) / expectedMs) * HOLD_AT)
      const whole = Math.floor(next)
      if (whole !== last) {
        last = whole
        setPercent(whole)
      }
      // Stop asking for frames once the bar has parked.
      if (next < HOLD_AT) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [status, expectedMs])

  return percent
}

interface ButtonProgressProps {
  status: Exclude<CallChipStatus, 'idle'>
  /** What the button is doing, e.g. "Saving". Kept to one word where possible. */
  label: string
  variant: Variant
  size: 'sm' | 'md' | 'lg'
  /** How long this action usually takes. See the caveat above. */
  expectedMs: number
  /** Shown while running; it rolls to a tick on success and to a retry arrow on failure. */
  icon?: ReactNode
}

export function ButtonProgress({ status, label, variant, size, expectedMs, icon }: ButtonProgressProps) {
  const { theme } = useTheme()
  const colors = (PALETTE[variant] ?? PALETTE.primary)[theme] ?? PALETTE.primary.light
  const percent = usePercent(status, expectedMs)

  /*
   * Mount the chip idle for one frame before handing it the real status.
   *
   * CallChip suppresses its own transitions until it has set `data-mounted`
   * on itself, so that a chip rendered into an already-finished state doesn't
   * animate on arrival. Here the chip is created at the moment the work
   * starts, i.e. already `running`, and that guard swallowed the fill
   * animation: the bar snapped to 90% instantly while the percentage counted
   * up from 0. Giving it a frame as `idle` lets the attribute land, so the
   * status change that follows animates the way it does in the component's
   * own demo.
   */
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    // A timer rather than requestAnimationFrame: rAF does not run at all in a
    // hidden or backgrounded tab, which left the chip stuck idle — measured —
    // when the page was not painting. A timeout always fires, so the worst
    // case is a bar that starts already filled on a tab nobody is looking at.
    const id = setTimeout(() => setArmed(true), 50)
    return () => clearTimeout(id)
  }, [])

  return (
    <CallChip
      className="ksmn-progress"
      status={armed ? status : 'idle'}
      name={status === 'error' ? 'Failed' : label}
      // 100 is read straight from the status rather than waiting for the
      // ticker's next render: the chip builds its screen-reader announcement
      // in the same commit the status changes, and would otherwise announce
      // "done" alongside whatever percentage the bar had reached.
      argument={status === 'error' ? '' : status === 'done' ? '100%' : `${percent}%`}
      icon={icon ?? null}
      expectedMs={expectedMs}
      size={CHIP_SIZE[size]}
      radius={8}
      showTimer={false}
      shake={status === 'error' ? 5 : 0}
      color={colors.text}
      surfaceColor="transparent"
      progressColor={colors.progress}
      progressOpacity={colors.progressOpacity}
      doneColor={colors.done}
      errorColor={colors.error}
      washOpacity={colors.wash}
    />
  )
}
