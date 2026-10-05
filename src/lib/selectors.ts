import { addDays } from 'date-fns'
import type { Task } from '@/db/types'
import { dayKey, fmtMin } from './utils'
import { leafTasks } from './scheduler'

export interface TodayItem {
  task: Task
  planLabel?: string
  sort: string
}

export function todayView(all: Task[], today = dayKey()) {
  const leaves = leafTasks(all)
  const items: TodayItem[] = []
  const missed: Task[] = []
  const overdue: Task[] = []
  const upcoming: Task[] = []
  const doneToday = all.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === today)
  const week = dayKey(addDays(new Date(), 7))

  for (const t of leaves) {
    if (t.status === 'done') continue
    if (t.deadline && t.deadline < today) {
      overdue.push(t)
      continue
    }
    const block = t.plan?.find((b) => b.date === today)
    if (block) {
      items.push({ task: t, planLabel: `${block.start} · ${fmtMin(block.min)}`, sort: '1' + block.start })
    } else if (t.scheduledDate === today || t.deadline === today) {
      items.push({ task: t, sort: '0' + (t.deadline === today ? '0' : '1') + t.priority })
    } else if ((t.plan?.length && t.plan.every((b) => b.date < today)) || (t.scheduledDate && t.scheduledDate < today && !t.plan?.some((b) => b.date > today))) {
      missed.push(t)
    } else if (t.deadline && t.deadline <= week) {
      upcoming.push(t)
    }
  }
  items.sort((a, b) => (a.sort < b.sort ? -1 : 1))
  overdue.sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
  upcoming.sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
  return { items, missed, overdue, upcoming, doneToday }
}

export function inboxTasks(all: Task[]) {
  return all.filter((t) => t.status !== 'done' && !t.parentId && !t.projectId && !t.deadline && !t.scheduledDate && !t.plan?.length)
}

export function subCounts(all: Task[]) {
  const m = new Map<string, { done: number; total: number }>()
  for (const t of all) {
    if (!t.parentId) continue
    const c = m.get(t.parentId) ?? { done: 0, total: 0 }
    c.total++
    if (t.status === 'done') c.done++
    m.set(t.parentId, c)
  }
  return m
}
