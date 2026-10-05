import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, color, style, ...p }: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap [&_svg]:size-3',
        !color && 'bg-muted text-muted-foreground',
        className,
      )}
      style={color ? { background: `color-mix(in oklch, ${color} 16%, transparent)`, color, ...style } : style}
      {...p}
    />
  )
}
