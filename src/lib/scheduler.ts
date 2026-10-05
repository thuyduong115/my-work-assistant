import { addDays, getDay } from 'date-fns'
import type { PlanBlock, Task, TimeEntry } from '@/db/types'
import { parseSlots } from '@/stores/settings'
import { dayKey, fromDayKey, hhmmToMin, minToHHMM } from './utils'

const PRIORITY_W = { urgent: 4, high: 3, medium: 2, low: 1 } as const
const HORIZON_DAYS = 60
const MIN_CHUNK = 25

export interface ScheduleOptions {
  workHours: Record<number, string>
  maxBlockMin: number
  bufferPct: number
  now?: Date
  /** fixed busy time (e.g. Google Calendar events) */
  busy?: PlanBlock[]
}

export interface ScheduleResult {
  plans: Map<string, PlanBlock[]>
  risks: { taskId: string; shortMin: number }[]
  factor: number
}

export function actualMinutes(entries: TimeEntry[]) {
  const m = new Map<string, number>()
  for (const e of entries) if (e.taskId) m.set(e.taskId, (m.get(e.taskId) ?? 0) + (e.end - e.start) / 60000)
  return m
}

/** How much longer than estimated you usually take (learned from history) */
export function calibrationFactor(tasks: Task[], actual: Map<string, number>) {
  let est = 0
  let act = 0
  for (const t of tasks) {
    const a = actual.get(t.id)
    if (t.status === 'done' && a && a > 5 && t.estimateMin > 0) {
      est += t.estimateMin
      act += a
    }
  }
  if (est < 120) return 1
  return Math.min(2, Math.max(0.8, act / est))
}

/** Tasks that get scheduled/listed: top-level only — sub-steps live inside their parent */
export function topTasks(tasks: Task[]) {
  return tasks.filter((t) => !t.parentId && !t.deleted)
}

/** Remaining estimate: open sub-steps' estimates when the task has sub-steps, else its own */
export function remainingEstimate(t: Task, all: Task[], actual: Map<string, number>) {
  const subs = all.filter((c) => c.parentId === t.id && !c.deleted)
  if (!subs.length) return t.estimateMin - (actual.get(t.id) ?? 0)
  const open = subs.filter((c) => c.status !== 'done')
  return open.reduce((s, c) => s + c.estimateMin - (actual.get(c.id) ?? 0), 0) - (actual.get(t.id) ?? 0) * (open.length / subs.length)
}

type Interval = [number, number]

export function schedule(all: Task[], entries: TimeEntry[], opts: ScheduleOptions): ScheduleResult {
  const now = opts.now ?? new Date()
  const today = dayKey(now)
  const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5
  const actual = actualMinutes(entries)
  const factor = calibrationFactor(all, actual)

  // free intervals per day
  const free = new Map<string, Interval[]>()
  const days: string[] = []
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = addDays(now, i)
    const k = dayKey(d)
    days.push(k)
    let slots = parseSlots(opts.workHours[getDay(d)] ?? '')
    if (i === 0) slots = slots.map(([a, b]) => [Math.max(a, nowMin), b] as Interval).filter(([a, b]) => b - a >= MIN_CHUNK)
    free.set(k, slots)
  }

  const occupy = (date: string, start: number, len: number) => {
    const iv = free.get(date)
    if (!iv) return
    const out: Interval[] = []
    for (const [a, b] of iv) {
      const s = start
      const e = start + len
      if (e <= a || s >= b) out.push([a, b])
      else {
        if (s > a) out.push([a, s])
        if (e < b) out.push([e, b])
      }
    }
    free.set(date, out.filter(([a, b]) => b - a >= 5))
  }

  for (const b of opts.busy ?? []) if (b.date >= today) occupy(b.date, hhmmToMin(b.start), b.min)

  const open = topTasks(all).filter((t) => t.status !== 'done')
  const pinned = open.filter((t) => t.pinned && t.plan?.length)
  for (const t of pinned) for (const b of t.plan!) if (b.date >= today) occupy(b.date, hhmmToMin(b.start), b.min)

  const candidates = open
    .filter((t) => !(t.pinned && t.plan?.length))
    .sort((a, b) => {
      if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
      if (!!a.deadline !== !!b.deadline) return a.deadline ? -1 : 1
      const p = PRIORITY_W[b.priority] - PRIORITY_W[a.priority]
      if (p) return p
      return (a.scheduledDate ?? '9') < (b.scheduledDate ?? '9') ? -1 : a.order - b.order
    })

  const plans = new Map<string, PlanBlock[]>()
  const risks: ScheduleResult['risks'] = []

  const allocate = (remaining: number, fromDay: string, untilDay: string | null) => {
    const blocks: PlanBlock[] = []
    for (const d of days) {
      if (remaining <= 0) break
      if (d < fromDay) continue
      if (untilDay && d > untilDay) break
      const iv = free.get(d)!
      for (const [a, b] of [...iv]) {
        if (remaining <= 0) break
        const avail = b - a
        if (avail < MIN_CHUNK && remaining > avail) continue
        const len = Math.min(avail, remaining, opts.maxBlockMin)
        blocks.push({ date: d, start: minToHHMM(a), min: len })
        occupy(d, a, len)
        remaining -= len
        // one block per task per day keeps days varied
        break
      }
    }
    return { blocks, remaining }
  }

  // tasks with a chosen time: one fixed block at that time, placed before the rest
  for (const t of candidates) {
    if (!t.scheduledDate || !t.scheduledTime || t.scheduledDate < today) continue
    const len = Math.min(8 * 60, Math.max(MIN_CHUNK, Math.round(remainingEstimate(t, all, actual) * factor)))
    const start = hhmmToMin(t.scheduledTime)
    occupy(t.scheduledDate, start, len)
    plans.set(t.id, [{ date: t.scheduledDate, start: t.scheduledTime, min: len }])
  }

  for (const t of candidates) {
    if (plans.has(t.id)) continue
    let remaining = Math.max(0, Math.round(remainingEstimate(t, all, actual) * factor))
    if (remaining === 0) remaining = MIN_CHUNK
    const fromDay = t.scheduledDate && t.scheduledDate > today ? t.scheduledDate : today
    let blocks: PlanBlock[] = []
    if (t.deadline) {
      // try to finish one day early (buffer) when deadline isn't imminent
      const early = opts.bufferPct > 0 && t.deadline > dayKey(addDays(now, 2)) ? dayKey(addDays(fromDayKey(t.deadline), -1)) : t.deadline
      const r1 = allocate(remaining, fromDay, t.deadline >= today ? early : today)
      blocks = r1.blocks
      remaining = r1.remaining
      if (remaining > 0 && early !== t.deadline) {
        const r2 = allocate(remaining, fromDay, t.deadline)
        blocks.push(...r2.blocks)
        remaining = r2.remaining
      }
      if (remaining > 0) {
        risks.push({ taskId: t.id, shortMin: remaining })
        const r3 = allocate(remaining, fromDay, null)
        blocks.push(...r3.blocks)
      }
    } else {
      blocks = allocate(remaining, fromDay, null).blocks
    }
    blocks.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
    plans.set(t.id, blocks)
  }
  return { plans, risks, factor }
}
