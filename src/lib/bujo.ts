import { endOfMonth, getDaysInMonth, startOfMonth } from 'date-fns'
import type { GEvent } from '@/gcal/gcal'
import type { Habit, HabitLog, Journal, JournalBlock, Project, Role, Task, TaskCategory, TimeEntry } from '@/db/types'
import { taskCategory } from './categories'
import { habitActiveOn } from './stats'
import { isHabitDone, logValue } from './habits'
import { topTasks } from './scheduler'
import { dayKey, fromDayKey, hhmmToMin, minToHHMM } from './utils'

export const BLOCK_KINDS: Record<JournalBlock['kind'], { label: string; icon: string; color: string }> = {
  sleep: { label: 'Ngủ', icon: '😴', color: '#6366f1' },
  class: { label: 'Học trên lớp', icon: '🏫', color: '#0ea5e9' },
  work: { label: 'Làm việc', icon: '💼', color: '#14b8a6' },
  meal: { label: 'Ăn uống', icon: '🍜', color: '#f59e0b' },
  move: { label: 'Di chuyển', icon: '🚌', color: '#94a3b8' },
  sport: { label: 'Thể thao', icon: '🏃', color: '#22c55e' },
  fun: { label: 'Giải trí', icon: '🎮', color: '#ec4899' },
  other: { label: 'Khác', icon: '📌', color: '#a8a29e' },
}

export const MOTTOS = [
  'Small steps, big results',
  'Great things take time',
  'Làm xong quan trọng hơn làm hoàn hảo',
  'Một bước nhỏ mỗi ngày',
  'Focus on progress, not perfection',
  'Hôm nay cố gắng hơn hôm qua',
  'Done is better than perfect',
  'Bắt đầu là đã đi được một nửa',
  'Discipline is choosing what you want most',
  'Từng chút một, đều đặn mỗi ngày',
]
export const mottoFor = (date: string) => MOTTOS[fromDayKey(date).getDate() % MOTTOS.length]

export interface Seg {
  key: string
  start: number // minutes from 00:00
  end: number
  label: string
  color: string
  /** planned (outline) vs what happened (solid) */
  planned?: boolean
  blockId?: string
  taskId?: string
}

/** minutes of [a, b] that fall on `date` (local), or null */
function clip(date: string, a: number, b: number): [number, number] | null {
  const d0 = fromDayKey(date).getTime()
  const d1 = d0 + 86_400_000
  const s = Math.max(a, d0)
  const e = Math.min(b, d1)
  if (e <= s) return null
  return [Math.round((s - d0) / 60000), Math.round((e - d0) / 60000)]
}

const taskColor = (t: Task | undefined, projects: Project[], roles: Role[]) =>
  (t?.projectId && projects.find((p) => p.id === t.projectId)?.color) || (t?.roleId && roles.find((r) => r.id === t.roleId)?.color) || '#8b5cf6'

/** Timeline rows: what was planned (task blocks, Google events) and what happened (focus sessions, manual blocks) */
export function timeline(date: string, d: { tasks: Task[]; entries: TimeEntry[]; projects: Project[]; roles: Role[]; events: GEvent[]; journal?: Journal | null }) {
  const planned: Seg[] = []
  for (const t of topTasks(d.tasks))
    for (const [i, b] of (t.plan ?? []).entries())
      if (b.date === date) {
        const s = hhmmToMin(b.start)
        planned.push({ key: `p${t.id}${i}`, start: s, end: s + b.min, label: t.title, color: taskColor(t, d.projects, d.roles), planned: true, taskId: t.id })
      }
  for (const e of d.events) {
    if (e.allDay) continue
    const c = clip(date, e.start, e.end)
    if (c) planned.push({ key: `g${e.id}`, start: c[0], end: c[1], label: e.title, color: e.color, planned: true })
  }

  const actual: Seg[] = []
  for (const b of d.journal?.blocks ?? []) {
    const k = BLOCK_KINDS[b.kind] ?? BLOCK_KINDS.other
    actual.push({ key: `b${b.id}`, start: hhmmToMin(b.start), end: hhmmToMin(b.end), label: b.label || k.label, color: k.color, blockId: b.id })
  }
  // focus sessions, merged when the same task continues within 10 minutes
  const sessions = d.entries
    .map((e) => ({ e, c: clip(date, e.start, e.end) }))
    .filter((x) => x.c)
    .sort((a, b) => a.c![0] - b.c![0])
  let last: Seg | undefined
  for (const { e, c } of sessions) {
    const t = d.tasks.find((x) => x.id === e.taskId)
    if (last && last.taskId === (e.taskId ?? '') && c![0] - last.end <= 10) {
      last.end = Math.max(last.end, c![1])
      continue
    }
    last = { key: `e${e.id}`, start: c![0], end: c![1], label: t?.title ?? 'Tập trung', color: taskColor(t, d.projects, d.roles), taskId: e.taskId ?? '' }
    actual.push(last)
  }
  const byStart = (a: Seg, b: Seg) => a.start - b.start
  return { planned: planned.sort(byStart), actual: actual.sort(byStart) }
}

/** Greedy lanes so labels under the line don't overlap (approx. width per character) */
export function lanes(segs: Seg[], widthPx: number, charPx = 6) {
  const pxPerMin = widthPx / 1440
  const ends: number[] = []
  return segs.map((s) => {
    const x = s.start * pxPerMin
    const w = Math.max((s.end - s.start) * pxPerMin, Math.min(s.label.length, 22) * charPx + 8)
    let lane = ends.findIndex((e) => e <= x)
    if (lane < 0) lane = ends.length
    ends[lane] = x + w
    return lane
  })
}

export type Mark = '•' | '×' | '>' | '△'

/** Top-level tasks that belong to a day: planned, scheduled, due, or finished that day */
export function dayTasks(date: string, tasks: Task[], today = dayKey()) {
  const out: { task: Task; mark: Mark; time?: string }[] = []
  for (const t of topTasks(tasks)) {
    const doneDay = t.doneAt ? dayKey(new Date(t.doneAt)) : undefined
    const block = t.plan?.find((b) => b.date === date)
    const on = doneDay === date || !!block || t.scheduledDate === date || t.deadline === date
    if (!on) continue
    // finished another day: shown only if that was later (migrated), not earlier
    if (t.status === 'done' && doneDay && doneDay < date) continue
    let mark: Mark = '•'
    if (t.status === 'done') mark = doneDay === date ? '×' : '>'
    else if (date < today) mark = '>'
    else if (t.status === 'doing') mark = '△'
    out.push({ task: t, mark, time: block?.start ?? (t.scheduledDate === date ? t.scheduledTime : undefined) })
  }
  return out.sort((a, b) => (a.time ?? '99') < (b.time ?? '99') ? -1 : (a.time ?? '99') > (b.time ?? '99') ? 1 : a.task.order - b.task.order)
}

/** Focus minutes per role on a day + manual block totals */
export function dayTime(date: string, d: { tasks: Task[]; entries: TimeEntry[]; roles: Role[]; journal?: Journal | null; categories?: TaskCategory[] }) {
  const byRole = new Map<string, number>()
  let focus = 0
  for (const e of d.entries) {
    const c = clip(date, e.start, e.end)
    if (!c) continue
    const m = c[1] - c[0]
    focus += m
    const t = d.tasks.find((x) => x.id === e.taskId)
    const key = d.categories ? (t ? taskCategory(t, d.categories) : '') : t?.roleId ?? ''
    byRole.set(key, (byRole.get(key) ?? 0) + m)
  }
  const byKind = new Map<JournalBlock['kind'], number>()
  for (const b of d.journal?.blocks ?? []) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + Math.max(0, hhmmToMin(b.end) - hhmmToMin(b.start)))
  const label = (id: string) => {
    const c = d.categories?.find((x) => x.id === id)
    if (c) return { name: `${c.icon} ${c.name}`, color: c.color }
    const r = d.roles.find((x) => x.id === id)
    return { name: r?.name ?? 'Khác', color: r?.color ?? '#94a3b8' }
  }
  const roles = [...byRole.entries()]
    .map(([id, min]) => ({ id, min, ...label(id) }))
    .sort((a, b) => b.min - a.min)
  return { focus, roles, byKind }
}

export const fmtHM = (min: number) => (min <= 0 ? '0' : min < 60 ? `${Math.round(min)}'` : `${Math.floor(min / 60)}h${min % 60 ? String(Math.round(min % 60)).padStart(2, '0') + "'" : ''}`)

/** Clamp "HH:mm" text into a valid time */
export function cleanTime(s: string) {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(s.trim())
  if (!m) return null
  return minToHHMM(Math.min(24 * 60, (+m[1]) * 60 + (+(m[2] ?? 0))))
}

export interface MonthDay {
  date: string
  score?: number
  mood?: number
  done: number
  focus: number
  sleep: number
  habitsDone: number
  habitsDue: number
}

/** Everything the monthly spread needs */
export function monthData(month: string, d: { tasks: Task[]; entries: TimeEntry[]; habits: Habit[]; logs: HabitLog[]; journals: Journal[]; roles: Role[]; projects: Project[] }) {
  const first = fromDayKey(`${month}-01`)
  const n = getDaysInMonth(first)
  const days: MonthDay[] = []
  const habits = d.habits.filter((h) => !h.archived)
  const jByDate = new Map(d.journals.map((j) => [j.date, j]))
  for (let i = 1; i <= n; i++) {
    const date = `${month}-${String(i).padStart(2, '0')}`
    const j = jByDate.get(date)
    const due = habits.filter((h) => habitActiveOn(h, date) && dayKey(new Date(h.createdAt)) <= date)
    days.push({
      date,
      score: j?.score,
      mood: j?.mood,
      done: d.tasks.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === date).length,
      focus: dayTime(date, { tasks: d.tasks, entries: d.entries, roles: d.roles }).focus,
      sleep: (j?.blocks ?? []).filter((b) => b.kind === 'sleep').reduce((s, b) => s + hhmmToMin(b.end) - hhmmToMin(b.start), 0),
      habitsDone: due.filter((h) => isHabitDone(h, logValue(d.logs, h, date))).length,
      habitsDue: due.length,
    })
  }
  const start = startOfMonth(first).getTime()
  const end = endOfMonth(first).getTime()
  const inMonth = d.entries.filter((e) => e.start >= start && e.start <= end)
  const byProject = new Map<string, number>()
  const byRole = new Map<string, number>()
  for (const e of inMonth) {
    const t = d.tasks.find((x) => x.id === e.taskId)
    const m = (e.end - e.start) / 60000
    byProject.set(t?.projectId ?? '', (byProject.get(t?.projectId ?? '') ?? 0) + m)
    byRole.set(t?.roleId ?? '', (byRole.get(t?.roleId ?? '') ?? 0) + m)
  }
  const scored = days.filter((x) => x.score)
  const slept = days.filter((x) => x.sleep > 0)
  const journaled = days.filter((x) => {
    const j = jByDate.get(x.date)
    return j && (j.score || j.morningAt || j.eveningAt || j.blocks?.length || j.bullets?.length || j.note)
  })
  const best = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  return {
    days,
    habits,
    totals: {
      done: days.reduce((s, x) => s + x.done, 0),
      focus: days.reduce((s, x) => s + x.focus, 0),
      avgScore: scored.length ? scored.reduce((s, x) => s + (x.score ?? 0), 0) / scored.length : 0,
      avgSleep: slept.length ? slept.reduce((s, x) => s + x.sleep, 0) / slept.length : 0,
      journaled: journaled.length,
      habitRate: days.reduce((s, x) => s + x.habitsDue, 0) ? days.reduce((s, x) => s + x.habitsDone, 0) / days.reduce((s, x) => s + x.habitsDue, 0) : 0,
    },
    best,
    projects: [...byProject.entries()]
      .map(([id, min]) => ({ id, min, name: d.projects.find((p) => p.id === id)?.name ?? 'Không thuộc project', color: d.projects.find((p) => p.id === id)?.color ?? '#94a3b8' }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 6),
    roles: [...byRole.entries()]
      .map(([id, min]) => ({ id, min, name: d.roles.find((r) => r.id === id)?.name ?? 'Khác', color: d.roles.find((r) => r.id === id)?.color ?? '#94a3b8' }))
      .sort((a, b) => b.min - a.min),
    wins: d.journals.filter((j) => j.date.startsWith(month) && j.win).sort((a, b) => (a.date < b.date ? -1 : 1)),
  }
}
