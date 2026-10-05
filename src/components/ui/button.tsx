import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm shadow-primary/20',
  secondary: 'bg-muted text-foreground hover:bg-muted/70',
  outline: 'border bg-card hover:bg-muted',
  ghost: 'hover:bg-muted',
  soft: 'bg-primary-soft text-primary hover:opacity-85',
  destructive: 'bg-destructive text-white hover:opacity-90',
} as const
const sizes = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9',
  'icon-sm': 'h-7 w-7',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[.97] disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
))
Button.displayName = 'Button'
