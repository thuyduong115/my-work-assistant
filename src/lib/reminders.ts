import { useEffect } from 'react'
import { addDays } from 'date-fns'
import { toast } from 'sonner'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { beep, useTimer } from '@/stores/timer'
import { useUI } from '@/stores/ui'
import { topTasks } from './scheduler'
import { dayKey, hhmmToMin } from './utils'

const FIRED_KEY = 'mwa-reminded'

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

/** true the first time a key is seen (keys are remembered for 3 days) */
function once(key: string) {
  const f = loadFired()
  if (f[key]) return false
  const cutoff = Date.now() - 3 * 86_400_000
  for (const k of Object.keys(f)) if (f[k] < cutoff) delete f[k]
  f[key] = Date.now()
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(f))
  } catch {
    /* ignore */
  }
  return true
}

export type NotifyTarget = { kind: 'ritual'; ritual: 'morning' | 'evening' } | { kind: 'task'; taskId: string } | { kind: 'focus' }

/**
 * System notification when the app is in the background (via the service worker so it
 * also works in installed apps on Android), in-app toast when it's visible.
 */
export async function showNotification(title: string, body: string, opts: { tag?: string; target?: NotifyTarget; force?: boolean } = {}) {
  const visible = document.visibilityState === 'visible'
  if (useSettings.getState().pomodoro.sound) beep()
  if (visible && !opts.force) return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const data = { target: opts.target }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, { body, icon: 'pwa-192.png', badge: 'pwa-192.png', tag: opts.tag, data })
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, { body, icon: 'pwa-192.png', tag: opts.tag })
    n.onclick = () => {
      window.focus()
      if (opts.target) openTarget(opts.target)
      n.close()
    }
    return true
  } catch {
    return false
  }
}

export function openTarget(t: NotifyTarget) {
  const ui = useUI.getState()
  if (t.kind === 'ritual') ui.openRitual(t.ritual)
  else if (t.kind === 'task') ui.openTask(t.taskId)
  else if (t.kind === 'focus') location.hash = '#/focus'
}

function remind(title: string, body: string, tag: string, target?: NotifyTarget, action?: { label: string; onClick: () => void }) {
  void showNotification(title, body, { tag, target })
  if (document.visibilityState === 'visible')
    toast(title, { description: body, duration: 15_000, action: action ?? (target ? { label: 'Mở', onClick: () => openTarget(target) } : undefined) })
}

async function check() {
  const { reminders: r } = useSettings.getState()
  if (!r.enabled) return
  const now = new Date()
  const today = dayKey(now)
  const tomorrow = dayKey(addDays(now, 1))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const all = (await db.tasks.toArray()).filter((t) => !t.deleted)
  const open = topTasks(all).filter((t) => t.status !== 'done')
  const timer = useTimer.getState()

  // planned blocks starting soon
  for (const t of open) {
    for (const b of t.plan ?? []) {
      if (b.date !== today) continue
      const start = hhmmToMin(b.start)
      if (nowMin < start - r.beforeMin || nowMin > start + 5) continue
      if (timer.running && timer.taskId === t.id) continue
      if (!once(`start:${t.id}:${b.date}:${b.start}`)) continue
      const inMin = start - nowMin
      remind(
        inMin > 0 ? `⏰ ${inMin} phút nữa: ${t.title}` : `▶ Đến giờ: ${t.title}`,
        `${b.start} · ${b.min} phút theo lịch`,
        `start-${t.id}`,
        { kind: 'task', taskId: t.id },
        { label: 'Bắt đầu', onClick: () => useTimer.getState().start({ taskId: t.id }) },
      )
    }
  }

  if (r.deadlines) {
    // exact-time deadlines: 1 hour before
    for (const t of open) {
      if (t.deadline !== today || !t.deadlineTime) continue
      const d = hhmmToMin(t.deadlineTime)
      if (nowMin < d - 60 || nowMin > d) continue
      if (once(`dl1h:${t.id}:${today}`)) remind(`⚠️ Còn ${d - nowMin} phút: ${t.title}`, `Hạn chót ${t.deadlineTime} hôm nay`, `dl-${t.id}`, { kind: 'task', taskId: t.id })
    }
    // one morning digest: overdue, due today, due tomorrow
    if (nowMin >= hhmmToMin(r.morning)) {
      const list = (pred: (t: Task) => boolean) => open.filter(pred).map((t) => t.title)
      const overdue = list((t) => !!t.deadline && t.deadline < today)
      const due = list((t) => t.deadline === today)
      const soon = list((t) => t.deadline === tomorrow)
      if ((overdue.length || due.length || soon.length) && once(`digest:${today}`)) {
        const parts = [
          overdue.length && `Quá hạn: ${overdue.slice(0, 3).join(', ')}${overdue.length > 3 ? '…' : ''}`,
          due.length && `Hôm nay: ${due.slice(0, 3).join(', ')}${due.length > 3 ? '…' : ''}`,
          soon.length && `Ngày mai: ${soon.slice(0, 3).join(', ')}${soon.length > 3 ? '…' : ''}`,
        ].filter(Boolean)
        remind(due.length + overdue.length ? `📌 ${due.length + overdue.length} việc cần xong hôm nay` : '📌 Deadline ngày mai', parts.join(' · '), 'digest')
      }
    }
  }

  if (r.rituals) {
    const j = await db.journal.get(`j-${today}`)
    const m = hhmmToMin(r.morning)
    const e = hhmmToMin(r.evening)
    if (nowMin >= m && nowMin < Math.min(e, m + 5 * 60) && !j?.morningAt && once(`morning:${today}`))
      remind('☀️ Bắt đầu ngày mới (1 phút)', 'Dọn việc tồn, chọn 3 việc chính hôm nay.', 'ritual', { kind: 'ritual', ritual: 'morning' })
    if (nowMin >= e && !j?.eveningAt && once(`evening:${today}`))
      remind('🌙 Tổng kết ngày (1 phút)', 'Tick việc đã xong, dời việc còn lại, ghi lại hôm nay thế nào.', 'ritual', { kind: 'ritual', ritual: 'evening' })
  }
}

/** Runs while the app is open (tab or installed app, also in the background) */
export function useReminders() {
  useEffect(() => {
    const run = () => void check().catch(() => undefined)
    const first = setTimeout(run, 3000)
    const iv = setInterval(run, 30_000)
    // clicks on service-worker notifications
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; target?: NotifyTarget } | undefined
      if (d?.type === 'mwa-notification' && d.target) openTarget(d.target)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      clearTimeout(first)
      clearInterval(iv)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [])
}

/** Opened from a notification / app shortcut / share sheet: ?action=…, ?text=… */
export function useLaunchParams() {
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (![...q.keys()].length) return
    const ui = useUI.getState()
    const action = q.get('action')
    const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n')
    if (action === 'capture') ui.openCapture()
    else if (action === 'morning' || action === 'evening') ui.openRitual(action)
    else if (action === 'focus') location.hash = '#/focus'
    else if (shared) ui.openCapture(shared, 'email')
    history.replaceState(null, '', location.pathname + location.hash)
  }, [])
}
