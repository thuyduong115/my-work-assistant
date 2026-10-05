import type { LucideIcon } from 'lucide-react'
import { CalendarDays, FolderKanban, Gauge, Home, Inbox, Repeat2, Settings, Timer, Users, LayoutGrid } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  key: string
}

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Hằng ngày', items: [
    { to: '/', label: 'Hôm nay', icon: Home, key: 't' },
    { to: '/inbox', label: 'Inbox', icon: Inbox, key: 'i' },
    { to: '/calendar', label: 'Lịch', icon: CalendarDays, key: 'c' },
    { to: '/focus', label: 'Tập trung', icon: Timer, key: 'f' },
    { to: '/habits', label: 'Thói quen', icon: Repeat2, key: 'h' },
  ] },
  { group: 'Tổ chức', items: [
    { to: '/projects', label: 'Projects', icon: FolderKanban, key: 'p' },
    { to: '/roles', label: 'Vai trò', icon: Users, key: 'r' },
    { to: '/matrix', label: 'Ma trận ưu tiên', icon: LayoutGrid, key: 'm' },
  ] },
  { group: 'Phân tích', items: [
    { to: '/dashboard', label: 'Dashboard', icon: Gauge, key: 'd' },
    { to: '/settings', label: 'Cài đặt', icon: Settings, key: ',' },
  ] },
]

export const NAV_FLAT = NAV.flatMap((g) => g.items)
