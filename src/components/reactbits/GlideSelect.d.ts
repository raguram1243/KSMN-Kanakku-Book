/**
 * Types for the vendored React Bits GlideSelect (JS-CSS variant).
 *
 * As with HoldButton, this keeps GlideSelect.jsx identical to the published
 * source (bar the icon swap to lucide-react) while giving call sites real
 * types. TypeScript resolves this .d.ts ahead of the .jsx.
 *
 * The inferred types read `options` as `string[]`, because the component's
 * own default is `['One', 'Two', 'Three']`. It actually accepts either, and
 * normalises internally: `o => (typeof o === 'string' ? { value: o, label: o } : o)`.
 */
export interface GlideSelectOption {
  value: string
  label: string
  /** Short note shown at the right of the row when `showTags` is on. */
  tag?: string
}

export interface GlideSelectProps {
  options?: (GlideSelectOption | string)[]
  /** Controlled value. Omit to use `defaultValue` and let it manage its own. */
  value?: string
  defaultValue?: string
  onChange?: (value: string, option: GlideSelectOption) => void
  placeholder?: string
  showTags?: boolean
  accentColor?: string
  surfaceColor?: string
  highlightColor?: string
  textColor?: string
  size?: 'sm' | 'md' | 'lg'
  radius?: number
  menuWidth?: number
  placement?: 'top' | 'bottom'
  align?: 'left' | 'right'
  popDuration?: number
  glideDuration?: number
  rememberPosition?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

declare const GlideSelect: (props: GlideSelectProps) => JSX.Element
export default GlideSelect
