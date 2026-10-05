import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import type { Habit, HabitLog, Journal, Project, Role, Task, TimeEntry } from './types'

const alive = <T extends { deleted: 0 | 1 }>(arr: T[]) => arr.filter((x) => !x.deleted)

export function useRoles(): Role[] {
  return useLiveQuery(async () => alive(await db.roles.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) ?? []
}
export function useProjects(): Project[] {
  return useLiveQuery(async () => alive(await db.projects.toArray()).sort((a, b) => a.createdAt - b.createdAt), []) ?? []
}
export function useTasks(): Task[] | undefined {
  return useLiveQuery(async () => alive(await db.tasks.toArray()).sort((a, b) => a.order - b.order), [])
}
export function useTimeEntries(): TimeEntry[] {
  return useLiveQuery(async () => alive(await db.timeEntries.toArray()), []) ?? []
}
export function useHabits(): Habit[] {
  return useLiveQuery(async () => alive(await db.habits.toArray()).sort((a, b) => a.order - b.order), []) ?? []
}
export function useHabitLogs(): HabitLog[] {
  return useLiveQuery(async () => alive(await db.habitLogs.toArray()), []) ?? []
}
export function useTask(id?: string): Task | undefined {
  return useLiveQuery(async () => (id ? db.tasks.get(id) : undefined), [id])
}
export function useJournals(): Journal[] {
  return useLiveQuery(async () => alive(await db.journal.toArray()).sort((a, b) => (a.date < b.date ? 1 : -1)), []) ?? []
}
export function useJournal(date: string): Journal | undefined {
  return useLiveQuery(async () => {
    const j = await db.journal.get(`j-${date}`)
    return j && !j.deleted ? j : undefined
  }, [date])
}
