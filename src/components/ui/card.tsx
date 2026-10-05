import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)} {...p} />
}

export function CardHeader({
  title,
  icon,
  action,
  description,
  className,
}: {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4 pb-2', className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary">
          {icon}
          {title}
        </h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...p} />
}
