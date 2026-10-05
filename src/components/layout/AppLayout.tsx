import { useEffect, useMemo, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Cloud, CloudOff, Flame, Loader2, Menu, Monitor, Moon, Plus, Search, Sparkles, Sun, X, AlertCircle } from 'lucide-react'
import { useHabitLogs, useProjects, useTasks, useTimeEntries } from '@/db/hooks'
import { activityByDay, level, streak, xpTotal } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { applyTheme, useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { useSync } from '@/sync/sync'
import { Button } from '../ui/button'
import { Dropdown, DropdownItem } from '../ui/dropdown'
import { Progress } from '../ui/misc'
import { MiniButton, TimerChip } from '../Timer'
import { NAV } from './nav'

function useStats() {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const logs = useHabitLogs()
  return useMemo(() => {
    const act = activityByDay(tasks, entries, logs)
    const s = streak((k) => !!act.get(k)?.productive)
    const xp = xpTotal(tasks, entries, logs)
    return { streak: s, xp, ...level(xp), inbox: tasks.filter((t) => t.status !== 'done' && !t.projectId && !t.parentId && !t.deadline && !t.scheduledDate).length }
  }, [tasks, entries, logs])
}

function SyncBadge() {
  const { status, error } = useSync()
  const nav = useNavigate()
  const map = {
    off: { icon: <CloudOff />, text: 'Chỉ lưu trên máy', cls: 'text-muted-foreground' },
    'signed-out': { icon: <CloudOff />, text: 'Chưa đăng nhập', cls: 'text-muted-foreground' },
    idle: { icon: <Cloud />, text: 'Đã đồng bộ', cls: 'text-success' },
    syncing: { icon: <Loader2 className="animate-spin" />, text: 'Đang đồng bộ…', cls: 'text-primary' },
    error: { icon: <AlertCircle />, text: 'Lỗi đồng bộ', cls: 'text-destructive' },
    offline: { icon: <CloudOff />, text: 'Offline', cls: 'text-warning' },
  }[status]
  return (
    <button onClick={() => nav('/settings#sync')} title={error} className={cn('flex items-center gap-1.5 text-xs [&_svg]:size-3.5', map.cls)}>
      {map.icon}
      {map.text}
    </button>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const st = useStats()
  const projects = useProjects().filter((p) => p.status === 'active')
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-8" />
        <div className="leading-tight">
          <div className="text-sm font-bold">Work Assistant</div>
          <div className="text-[11px] text-muted-foreground">Trợ lý cá nhân của bạn</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Flame className={cn('size-4', st.streak ? 'text-orange-500' : 'text-muted-foreground')} />
            {st.streak} ngày
          </div>
          <div className="text-xs font-semibold text-primary">Lv {st.lv}</div>
        </div>
        <Progress value={st.progress} className="mt-2 h-1.5" />
        <div className="mt-1 text-[11px] text-muted-foreground">{st.xp} XP · còn {st.toNext} XP lên cấp</div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.group}</div>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition [&_svg]:size-4',
                    isActive ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <it.icon />
                <span className="flex-1">{it.label}</span>
                {it.to === '/inbox' && st.inbox > 0 && <span className="rounded-md bg-muted px-1.5 text-[11px]">{st.inbox}</span>}
              </NavLink>
            ))}
            {g.group === 'Tổ chức' && projects.length > 0 && (
              <div className="mt-1 ml-4 border-l pl-2">
                {projects.slice(0, 8).map((p) => (
                  <NavLink
                    key={p.id}
                    to={`/projects/${p.id}`}
                    onClick={onNavigate}
                    className={({ isActive }) => cn('flex items-center gap-2 truncate rounded-md px-2 py-1 text-xs transition', isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="truncate">{p.name}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="px-2">
        <SyncBadge />
      </div>
    </div>
  )
}

function ThemeMenu() {
  const { theme, accent, set } = useSettings()
  useEffect(() => {
    applyTheme(theme, accent)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const fn = () => applyTheme('system', accent)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [theme, accent])
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor
  return (
    <Dropdown
      trigger={
        <Button variant="ghost" size="icon" aria-label="Giao diện">
          <Icon />
        </Button>
      }
    >
      <DropdownItem onSelect={() => set({ theme: 'light' })}>
        <Sun /> Sáng
      </DropdownItem>
      <DropdownItem onSelect={() => set({ theme: 'dark' })}>
        <Moon /> Tối
      </DropdownItem>
      <DropdownItem onSelect={() => set({ theme: 'system' })}>
        <Monitor /> Theo hệ thống
      </DropdownItem>
      <div className="flex gap-1.5 px-2.5 py-2">
        {(['violet', 'pink', 'teal', 'orange', 'blue', 'green'] as const).map((a) => (
          <button
            key={a}
            onClick={() => set({ accent: a })}
            data-accent={a}
            aria-label={a}
            className={cn('size-5 rounded-full bg-primary ring-offset-2 ring-offset-card', accent === a && 'ring-2 ring-primary')}
          />
        ))}
      </div>
    </Dropdown>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { openCapture, setPalette, mobileNav, setMobileNav } = useUI()
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-sidebar lg:block">
        <Sidebar />
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="animate-pop absolute inset-y-0 left-0 w-72 border-r bg-sidebar shadow-2xl">
            <button className="absolute top-4 right-3 rounded-md p-1 text-muted-foreground" onClick={() => setMobileNav(false)} aria-label="Đóng menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Menu">
            <Menu />
          </Button>
          <button
            onClick={() => setPalette(true)}
            className="flex h-9 max-w-xs flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition hover:border-primary/40"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">Tìm / lệnh nhanh…</span>
            <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <TimerChip />
            <MiniButton />
            <ThemeMenu />
            <Button onClick={() => openCapture()} className="hidden sm:inline-flex">
              <Sparkles /> Nhập nhanh
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 pb-24 sm:px-6 lg:pb-8">{children}</main>
      </div>

      <button
        onClick={() => openCapture()}
        className="fixed right-4 bottom-20 z-30 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition active:scale-95 sm:hidden"
        aria-label="Nhập nhanh"
      >
        <Plus className="size-6" />
      </button>
      <MobileTabs />
    </div>
  )
}

function MobileTabs() {
  const items = [NAV[0].items[0], NAV[0].items[2], NAV[0].items[3], NAV[0].items[4], NAV[2].items[0]]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium [&_svg]:size-5', isActive ? 'text-primary' : 'text-muted-foreground')}
        >
          <it.icon />
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
