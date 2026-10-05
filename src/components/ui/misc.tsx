import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Progress({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  )
}

export function CheckCircle({ checked, onChange, color, size = 20 }: { checked: boolean; onChange: () => void; color?: string; size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-2 transition-all hover:scale-110',
        checked ? 'border-transparent text-white' : 'hover:bg-primary-soft',
      )}
      style={{
        width: size,
        height: size,
        borderColor: checked ? undefined : color ?? 'var(--input)',
        background: checked ? color ?? 'var(--success)' : undefined,
      }}
    >
      {checked && <Check strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />}
    </button>
  )
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-6">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition [&_svg]:size-3.5',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          {icon}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, icon, color, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; color?: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon && (
          <span
            className="grid size-7 place-items-center rounded-lg [&_svg]:size-4"
            style={{ background: `color-mix(in oklch, ${color ?? 'var(--primary)'} 15%, transparent)`, color: color ?? 'var(--primary)' }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="tabular mt-1.5 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}
