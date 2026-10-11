import { useTheme } from '../../context/ThemeContext';
import GlideSelect from '../reactbits/GlideSelect';
import './ThemedSelect.css';

/**
 * The app's dropdown: React Bits' GlideSelect in our colours.
 *
 * GlideSelect takes its colours as props and writes them to CSS variables at
 * render time, so it cannot follow the `dark` class on its own the way the
 * Tailwind components do. This wrapper picks the palette from ThemeContext
 * and re-renders when the theme is toggled.
 *
 * It also presents a controlled `value` / `onChange(value)` API, matching the
 * native `<select>` elements it replaces, so swapping one for the other is a
 * like-for-like change at the call site.
 */

/** Brand indigo for the tick and the sliding highlight; surfaces follow the theme. */
const PALETTE = {
  light: {
    accent: '#4f46e5', // primary-600, the tick
    surface: '#ffffff',
    highlight: '#e0e7ff', // primary-100, the sliding pill
    text: '#0f172a',
  },
  dark: {
    accent: '#a5b4fc', // primary-300, legible on a dark surface
    surface: '#1f2937', // gray-800, matching the app's dark inputs
    highlight: '#3730a3', // primary-800
    text: '#f3f4f6',
  },
} as const

export interface SelectOption {
  value: string
  label: string
  /** Optional short note shown on the right of the row. */
  tag?: string
}

interface ThemedSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Required: these replace native selects, which all carried an aria-label. */
  ariaLabel: string
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  menuWidth?: number
  placement?: 'top' | 'bottom'
  align?: 'left' | 'right'
  showTags?: boolean
  className?: string
}

export function ThemedSelect({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  size = 'md',
  menuWidth = 200,
  placement = 'bottom',
  align = 'left',
  showTags = false,
  className = '',
}: ThemedSelectProps) {
  const { theme } = useTheme()
  const colors = PALETTE[theme] ?? PALETTE.light

  return (
    <GlideSelect
      options={options}
      value={value}
      onChange={(next: string) => onChange(next)}
      ariaLabel={ariaLabel}
      showTags={showTags}
      accentColor={colors.accent}
      surfaceColor={colors.surface}
      highlightColor={colors.highlight}
      textColor={colors.text}
      size={size}
      radius={8}
      menuWidth={menuWidth}
      placement={placement}
      align={align}
      popDuration={180}
      glideDuration={220}
      rememberPosition
      disabled={disabled}
      className={`ksmn-select ${className}`.trim()}
    />
  )
}
