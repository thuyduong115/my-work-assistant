import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'animate-pop fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border bg-card shadow-2xl outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold">{title}</D.Title>
              {description ? (
                <D.Description className="mt-0.5 text-xs text-muted-foreground">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</D.Description>
              )}
            </div>
            <D.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Đóng">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
