import { cn } from '@/lib/utils'

/**
 * Icons are stored either as an emoji ("💧") or as a Phosphor icon with its SVG
 * body inlined: "ph:drop-fill|<path …/>" — so rendering never needs the icon set.
 */
export function isSvgIcon(v?: string) {
  return !!v && v.startsWith('ph:')
}

export function makeIcon(name: string, body: string) {
  return `ph:${name}|${body}`
}

export function iconName(v?: string) {
  return isSvgIcon(v) ? v!.slice(3, v!.indexOf('|')) : undefined
}

/** Text-only contexts (<option>, titles): emoji or nothing */
export function iconText(v?: string) {
  return v && !isSvgIcon(v) ? v + ' ' : ''
}

export function AppIcon({ value, size = 18, className, style, fallback = '•' }: { value?: string; size?: number; className?: string; style?: React.CSSProperties; fallback?: string }) {
  if (!value) return <span className={className} style={style}>{fallback}</span>
  if (!isSvgIcon(value))
    return (
      <span className={cn('inline-block leading-none', className)} style={{ fontSize: size * 0.95, ...style }}>
        {value}
      </span>
    )
  const body = value.slice(value.indexOf('|') + 1)
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}
