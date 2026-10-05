import * as M from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Dropdown({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="animate-pop z-50 min-w-44 rounded-xl border bg-card p-1 text-sm shadow-xl"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  )
}

export function DropdownItem({ className, danger, ...p }: M.DropdownMenuItemProps & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none select-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...p}
    />
  )
}

export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-border" />
export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground uppercase">{children}</M.Label>
)
