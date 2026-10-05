import { addDays, differenceInCalendarDays, getDay } from 'date-fns'
import type { Habit, HabitLog, Task, TimeEntry } from '@/db/types'
import { dayKey, fromDayKey } from './utils'

export function focusByDay(entries: TimeEntry[]) {
  const m = new Map<string, number>()
  for (const e of entries) {
    const k = dayKey(new Date(e.start))
    m.set(k, (m.get(k) ?? 0) + (e.end - e.start) / 60000)
  }
  return m
}

export function doneByDay(tasks: Task[]) {
  const m = new Map<string, number>()
  for (const t of tasks) if (t.status === 'done' && t.doneAt) {
    const k = dayKey(new Date(t.doneAt))
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** A "productive day" = finished ≥1 task OR focused ≥ 25 minutes */
export function activityByDay(tasks: Task[], entries: TimeEntry[], logs: HabitLog[]) {
  const done = doneByDay(tasks)
  const focus = focusByDay(entries)
  const habit = new Map<string, number>()
  for (const l of logs) if (l.count > 0) habit.set(l.date, (habit.get(l.date) ?? 0) + 1)
  const keys = new Set([...done.keys(), ...focus.keys(), ...habit.keys()])
  const out = new Map<string, { done: number; focus: number; habits: number; productive: boolean; score: number }>()
  for (const k of keys) {
    const d = done.get(k) ?? 0
    const f = focus.get(k) ?? 0
    const h = habit.get(k) ?? 0
    out.set(k, { done: d, focus: f, habits: h, productive: d > 0 || f >= 25, score: d * 2 + f / 25 + h })
  }
  return out
}

export function streak(isActive: (k: string) => boolean, today = new Date()) {
  let cur = 0
  let d = today
  // today not yet active doesn't break the streak
  if (!isActive(dayKey(d))) d = addDays(d, -1)
  while (isActive(dayKey(d))) {
    cur++
    d = addDays(d, -1)
  }
  return cur
}

export function bestStreak(activeKeys: string[]) {
  const sorted = [...new Set(activeKeys)].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const k of sorted) {
    run = prev && differenceInCalendarDays(fromDayKey(k), fromDayKey(prev)) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

export function habitActiveOn(h: Habit, k: string) {
  return h.days.includes(getDay(fromDayKey(k)))
}

/** Habit streak counts only the habit's scheduled weekdays */
export function habitStreak(h: Habit, logs: HabitLog[], today = new Date()) {
  const done = new Set(logs.filter((l) => l.habitId === h.id && l.count >= h.target).map((l) => l.date))
  let cur = 0
  let d = today
  if (!done.has(dayKey(d))) d = addDays(d, -1)
  for (let i = 0; i < 400; i++) {
    const k = dayKey(d)
    if (habitActiveOn(h, k)) {
      if (!done.has(k)) break
      cur++
    }
    d = addDays(d, -1)
  }
  return cur
}

export function xpTotal(tasks: Task[], entries: TimeEntry[], logs: HabitLog[]) {
  let xp = 0
  for (const t of tasks) if (t.status === 'done') xp += 10 + Math.round(t.estimateMin / 30) * 5
  for (const e of entries) if (e.kind === 'pomodoro') xp += 5
  for (const l of logs) xp += 3 * Math.min(l.count, 5)
  return xp
}

export function level(xp: number) {
  const lv = Math.floor(Math.sqrt(xp / 50)) + 1
  const cur = 50 * (lv - 1) ** 2
  const next = 50 * lv ** 2
  return { lv, progress: (xp - cur) / (next - cur), toNext: next - xp }
}

export function isOverdue(t: Task, today = dayKey()) {
  return t.status !== 'done' && !!t.deadline && t.deadline < today
}

/** 0 (great) … 100 (procrastinating hard) */
export function procrastinationScore(tasks: Task[], today = new Date()) {
  const tk = dayKey(today)
  const open = tasks.filter((t) => t.status !== 'done')
  const overdue = open.filter((t) => isOverdue(t, tk)).length
  const postpones = open.reduce((s, t) => s + Math.min(t.postponeCount || 0, 5), 0)
  const weekAgo = addDays(today, -7).getTime()
  const due7 = tasks.filter((t) => t.deadline && t.deadline >= dayKey(addDays(today, -7)) && t.deadline < tk)
  const doneOnTime = due7.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) <= t.deadline!).length
  const rate = due7.length ? doneOnTime / due7.length : 1
  const recentDone = tasks.filter((t) => t.doneAt && t.doneAt > weekAgo).length
  let score = overdue * 12 + postpones * 4 + (1 - rate) * 30 - Math.min(recentDone, 10) * 2
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, overdue, postpones, onTimeRate: rate, recentDone }
}

export function scoreLabel(score: number) {
  if (score < 15) return { label: 'Tuyệt vời — bạn đang làm chủ thời gian!', color: 'var(--success)' }
  if (score < 40) return { label: 'Ổn — để ý vài task đang trễ.', color: 'var(--warning)' }
  if (score < 70) return { label: 'Đang trì hoãn — hãy chia nhỏ và bắt đầu 2 phút.', color: '#f97316' }
  return { label: 'Báo động! Dọn task quá hạn ngay hôm nay.', color: 'var(--destructive)' }
}
