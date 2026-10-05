import { addDays, addMonths, addWeeks, getDay, parseISO } from 'date-fns'
import { db, put, remove, DEFAULT_ROLE_ID } from './db'
import type { Journal, Recurrence, Task } from './types'
import { dayKey, uid } from '@/lib/utils'

export function newTask(partial: Partial<Task> = {}): Task {
  const now = Date.now()
  return {
    id: uid(),
    title: '',
    status: 'todo',
    priority: 'medium',
    estimateMin: 30,
    postponeCount: 0,
    order: now,
    createdAt: now,
    updatedAt: now,
    deleted: 0,
    dirty: 1,
    roleId: partial.projectId ? undefined : DEFAULT_ROLE_ID,
    ...partial,
  }
}

export async function createTask(partial: Partial<Task>) {
  const t = newTask(partial)
  if (t.projectId && !t.roleId) {
    const p = await db.projects.get(t.projectId)
    t.roleId = p?.roleId
  }
  return put('tasks', t)
}

export const updateTask = (id: string, patch: Partial<Task>) => put('tasks', { id, ...patch })

export async function deleteTask(id: string) {
  const subs = await db.tasks.where('parentId').equals(id).toArray()
  for (const s of subs) await remove('tasks', s.id)
  await remove('tasks', id)
}

function nextDate(k: string, r: Recurrence) {
  const d = parseISO(k)
  switch (r) {
    case 'daily':
      return addDays(d, 1)
    case 'weekdays': {
      let n = addDays(d, 1)
      while ([0, 6].includes(getDay(n))) n = addDays(n, 1)
      return n
    }
    case 'weekly':
      return addWeeks(d, 1)
    case 'monthly':
      return addMonths(d, 1)
  }
}

/**
 * Toggle done. Completing a recurring task spawns the next occurrence.
 * Ticking the last open sub-step completes its parent; un-ticking one reopens it.
 * Returns whether the task is now done, and the parent if it was auto-completed.
 */
export async function toggleDone(task: Task): Promise<{ done: boolean; parent?: Task }> {
  if (task.status === 'done') {
    await updateTask(task.id, { status: 'todo', doneAt: undefined })
    if (task.parentId) {
      const parent = await db.tasks.get(task.parentId)
      if (parent?.status === 'done') await updateTask(parent.id, { status: 'todo', doneAt: undefined })
    }
    return { done: false }
  }
  await updateTask(task.id, { status: 'done', doneAt: Date.now() })
  let parentDone: Task | undefined
  if (task.parentId) {
    const parent = await db.tasks.get(task.parentId)
    const siblings = (await db.tasks.where('parentId').equals(task.parentId).toArray()).filter((s) => !s.deleted)
    if (parent && !parent.deleted && parent.status !== 'done' && siblings.every((s) => s.status === 'done')) {
      await toggleDone(parent)
      parentDone = parent
    }
  }
  if (task.recurrence) {
    const anchor = task.deadline ?? task.scheduledDate ?? dayKey()
    const next = dayKey(nextDate(anchor, task.recurrence))
    await createTask({
      ...task,
      id: uid(),
      status: 'todo',
      doneAt: undefined,
      postponeCount: 0,
      plan: undefined,
      pinned: false,
      deadline: task.deadline ? next : undefined,
      scheduledDate: task.scheduledDate || !task.deadline ? next : undefined,
      createdAt: Date.now(),
    })
  }
  return { done: true, parent: parentDone }
}

/** Move to tomorrow, counting the postponement (anti-procrastination data) */
export async function postpone(task: Task, days = 1) {
  const from = task.scheduledDate && task.scheduledDate > dayKey() ? task.scheduledDate : dayKey()
  const to = dayKey(addDays(parseISO(from), days))
  await updateTask(task.id, {
    scheduledDate: to,
    postponeCount: (task.postponeCount || 0) + 1,
    plan: task.plan?.map((b) => (b.date <= dayKey() ? { ...b, date: to } : b)),
  })
}

export async function setStatus(task: Task, status: Task['status']) {
  if (status === 'done') {
    await toggleDone({ ...task, status: 'todo' })
    return
  }
  await updateTask(task.id, { status, doneAt: undefined })
}

export const journalId = (date: string) => `j-${date}`

/** Patch the day's journal entry (created on first write) */
export const saveJournal = (date: string, patch: Partial<Journal>) => put('journal', { id: journalId(date), date, ...patch })
