import { useEffect } from 'react'
import { create } from 'zustand'
import { db, putMany } from '@/db/db'
import { useTasks } from '@/db/hooks'
import type { Task } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { schedule } from './scheduler'
import { dayKey } from './utils'
import { busyBlocks, useGCal } from '@/gcal/gcal'

interface RiskState {
  risks: { taskId: string; shortMin: number }[]
  factor: number
  lastRun?: number
}
export const useSchedule = create<RiskState>(() => ({ risks: [], factor: 1 }))

const samePlan = (a?: Task['plan'], b?: Task['plan']) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

export async function runSchedule() {
  const tasks = (await db.tasks.toArray()).filter((t) => !t.deleted)
  const entries = (await db.timeEntries.toArray()).filter((e) => !e.deleted)
  const s = useSettings.getState()
  const r = schedule(tasks, entries, { workHours: s.workHours, maxBlockMin: s.maxBlockMin, bufferPct: s.bufferPct, busy: busyBlocks(useGCal.getState().events) })
  const today = dayKey()
  const worked = new Set(entries.filter((e) => e.taskId).map((e) => e.taskId + '@' + dayKey(new Date(e.start))))
  const changed: (Partial<Task> & { id: string })[] = []
  for (const t of tasks) {
    if (t.status === 'done' || (t.pinned && t.plan?.length)) continue
    const next = r.plans.get(t.id) ?? []
    // keep a little past history for missed-plan detection
    const past = (t.plan ?? []).filter((b) => b.date < today)
    const plan = [...past.slice(-3), ...next]
    // a planned day that passed with no work logged counts as a postponement
    const missed = past.filter((b) => b.date > (t.lastMissed ?? '') && !worked.has(t.id + '@' + b.date))
    const patch: Partial<Task> & { id: string } = { id: t.id }
    if (!samePlan(t.plan, plan)) patch.plan = plan
    if (missed.length) {
      patch.postponeCount = (t.postponeCount || 0) + 1
      patch.lastMissed = missed[missed.length - 1].date
    }
    if (Object.keys(patch).length > 1) changed.push(patch)
  }
  if (changed.length) await putMany('tasks', changed)
  useSchedule.setState({ risks: r.risks, factor: r.factor, lastRun: Date.now() })
  return { changed: changed.length, risks: r.risks }
}

/** Re-plan automatically when the set of open tasks meaningfully changes */
export function useAutoSchedule() {
  const tasks = useTasks()
  const { autoSchedule, workHours, maxBlockMin, bufferPct } = useSettings()
  const gEvents = useGCal((s) => s.events)
  const sig = tasks
    ? JSON.stringify([
        tasks.map((t) => [t.id, t.status, t.estimateMin, t.deadline, t.scheduledDate, t.scheduledTime, t.priority, t.pinned, t.parentId, t.pinned ? t.plan : 0]),
        workHours,
        maxBlockMin,
        bufferPct,
        busyBlocks(gEvents),
      ])
    : ''
  useEffect(() => {
    if (!sig || !autoSchedule) return
    const id = setTimeout(() => void runSchedule(), 1200)
    return () => clearTimeout(id)
  }, [sig, autoSchedule])
}
