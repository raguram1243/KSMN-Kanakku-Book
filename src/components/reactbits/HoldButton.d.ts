/**
 * Types for the vendored React Bits HoldButton (JS-CSS variant).
 *
 * The component ships as plain .jsx. Declaring its props here rather than
 * converting it to TypeScript keeps HoldButton.jsx byte-identical to the
 * published source, so a future React Bits update can be pasted straight over
 * it. TypeScript resolves this .d.ts ahead of the .jsx.
 *
 * Two things the inferred types got wrong, which is why this file exists:
 * `onTap` is destructured with no default but called as `onTap?.()`, so it is
 * optional; and every other prop has a default, so none of them are required.
 */
import type { ReactNode } from 'react'

export interface HoldButtonProps {
  children?: ReactNode
  doneLabel?: string
  icon?: ReactNode
  doneIcon?: ReactNode
  backgroundColor?: string
  fillColor?: string
  textColor?: string
  fillTextColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  fillDirection?: 'right' | 'left' | 'up' | 'down'
  holdTime?: number
  releaseTime?: number
  pressScale?: number
  wave?: boolean
  waveAmplitude?: number
  glow?: boolean
  resetAfter?: number
  disabled?: boolean
  /** Fires once the hold completes. */
  onHold?: () => void
  /** Fires on a quick tap, i.e. a press too short to count as a hold. */
  onTap?: () => void
  className?: string
}

declare const HoldButton: (props: HoldButtonProps) => JSX.Element
export default HoldButton
