import Dexie, { type EntityTable } from 'dexie'
import type { Habit, HabitLog, Journal, Project, Role, Task, TimeEntry, TableName, Base } from './types'

export class AppDB extends Dexie {
  roles!: EntityTable<Role, 'id'>
  projects!: EntityTable<Project, 'id'>
  tasks!: EntityTable<Task, 'id'>
  timeEntries!: EntityTable<TimeEntry, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  journal!: EntityTable<Journal, 'id'>

  constructor() {
    super('my-work-assistant')
    this.version(1).stores({
      roles: 'id, dirty, updatedAt',
      projects: 'id, roleId, dirty, updatedAt',
      tasks: 'id, projectId, roleId, parentId, status, deadline, dirty, updatedAt',
      timeEntries: 'id, taskId, start, dirty, updatedAt',
      habits: 'id, dirty, updatedAt',
      habitLogs: 'id, habitId, date, dirty, updatedAt',
    })
    this.version(2).stores({ journal: 'id, date, dirty, updatedAt' })
  }
}

export const db = new AppDB()

type Listener = () => void
const listeners = new Set<Listener>()
/** Fires after any local write (used by the sync engine) */
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  listeners.forEach((l) => l())
}

interface Rows {
  roles: Role
  projects: Project
  tasks: Task
  timeEntries: TimeEntry
  habits: Habit
  habitLogs: HabitLog
  journal: Journal
}
type Row<T extends TableName> = Rows[T]

/** Insert or patch a record, marking it dirty for sync */
export async function put<T extends TableName>(table: T, rec: Partial<Row<T>> & { id: string }) {
  const t = db[table] as unknown as EntityTable<Base & Record<string, unknown>, 'id'>
  const existing = await t.get(rec.id)
  const next = { ...(existing ?? { deleted: 0 }), ...rec, updatedAt: Date.now(), dirty: 1 } as Base &
    Record<string, unknown>
  await t.put(next)
  notify()
  return next as unknown as Row<T>
}

export async function putMany<T extends TableName>(table: T, recs: (Partial<Row<T>> & { id: string })[]) {
  const t = db[table] as unknown as EntityTable<Base & Record<string, unknown>, 'id'>
  await db.transaction('rw', t, async () => {
    for (const rec of recs) {
      const existing = await t.get(rec.id)
      await t.put({ ...(existing ?? { deleted: 0 }), ...rec, updatedAt: Date.now(), dirty: 1 } as Base &
        Record<string, unknown>)
    }
  })
  notify()
}

/** Soft delete (so deletions sync) */
export async function remove(table: TableName, id: string) {
  const t = db[table] as unknown as EntityTable<Base, 'id'>
  await t.update(id, { deleted: 1, dirty: 1, updatedAt: Date.now() })
  notify()
}

export const DEFAULT_ROLE_ID = 'role-personal'

/** First-run seed. Old updatedAt so that remote edits/deletions always win. */
export async function seed() {
  if (localStorage.getItem('mwa-seeded')) return
  const now = Date.now()
  const base = { updatedAt: 1, deleted: 0 as const, dirty: 1 as const }
  if (!(await db.roles.get(DEFAULT_ROLE_ID))) {
    await db.roles.put({ id: DEFAULT_ROLE_ID, name: 'Cá nhân', color: '#8b5cf6', icon: '🌸', description: 'Cuộc sống, sức khoẻ, học tập cá nhân', ...base })
  }
  const habits: [string, string, string, string][] = [
    ['habit-water', 'Uống đủ 2L nước', '💧', '#06b6d4'],
    ['habit-read', 'Đọc sách 20 phút', '📚', '#f97316'],
    ['habit-move', 'Vận động 30 phút', '🏃', '#22c55e'],
  ]
  for (const [i, [id, name, icon, color]] of habits.entries()) {
    if (!(await db.habits.get(id)))
      await db.habits.put({ id, name, icon, color, target: 1, days: [0, 1, 2, 3, 4, 5, 6], createdAt: now, order: i, ...base })
  }
  localStorage.setItem('mwa-seeded', '1')
  notify()
}
