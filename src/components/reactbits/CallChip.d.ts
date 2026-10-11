/**
 * Types for the vendored React Bits CallChip (JS-CSS variant).
 *
 * Same arrangement as HoldButton and GlideSelect: the component stays plain
 * .jsx so a future React Bits update can be pasted straight over it, and the
 * props live here instead. TypeScript resolves this .d.ts ahead of the .jsx.
 *
 * The published source imports its icons from @hugeicons. Ours are swapped for
 * the lucide-react equivalents the rest of the app already ships, so adding
 * this component pulled in no new dependency. Nothing else was changed.
 */
import type { CSSProperties, ReactNode } from 'react'

export type CallChipStatus = 'idle' | 'running' | 'done' | 'error'

export interface CallChipProps {
  /**
   * One of the component's four built-in glyphs, or any node of your own
   * (`typeof icon === 'string'` is what picks between the two).
   */
  icon?: 'terminal' | 'file' | 'search' | 'edit' | ReactNode
  /** Leading label, rendered in medium weight. */
  name?: string
  /** Trailing label, rendered at 72% opacity. */
  argument?: string
  status?: CallChipStatus
  /**
   * How long the fill takes to travel, linearly, to 90% of the chip while the
   * status is `running`; it finishes the last 10% when the status turns
   * `done`. It is an estimate, not real progress — the component has no way
   * to know how far along the work actually is.
   */
  expectedMs?: number
  size?: number
  radius?: number
  color?: string
  surfaceColor?: string
  progressColor?: string
  progressOpacity?: number
  doneColor?: string
  errorColor?: string
  washOpacity?: number
  /** Pixels of horizontal shake on `error`; 0 disables it. */
  shake?: number
  /** Shows a live elapsed-time readout at the right of the chip. */
  showTimer?: boolean
  /** When set and the status is `error`, the whole chip becomes a retry button. */
  onRetry?: () => void
  className?: string
  style?: CSSProperties
}

declare const CallChip: (props: CallChipProps) => JSX.Element
export default CallChip
