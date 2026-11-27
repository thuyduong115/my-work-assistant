import { addDays } from 'date-fns'
import { db, put } from '@/db/db'
import { journalId, saveJournal } from '@/db/actions'
import type { Course, CourseKind, CourseStatus, Journal, StudyLog } from '@/db/types'
import { dayKey, fromDayKey, uid } from './utils'

export const KIND_INFO: Record<CourseKind, { label: string; icon: string; unit: string }> = {
  course: { label: 'Khoá học', icon: '🎓', unit: 'bài' },
  cert: { label: 'Chứng chỉ', icon: '📜', unit: 'phần' },
  book: { label: 'Sách', icon: '📖', unit: 'chương' },
  skill: { label: 'Kỹ năng', icon: '🛠️', unit: 'mục' },
}

export const STATUS_INFO: Record<CourseStatus, { label: string; order: number }> = {
  learning: { label: 'Đang học', order: 0 },
  planned: { label: 'Dự định', order: 1 },
  paused: { label: 'Tạm dừng', order: 2 },
  done: { label: 'Hoàn thành', order: 3 },
}

export function newCourse(p: Partial<Course>): Course {
  const now = Date.now()
  return {
    id: uid(),
    name: '',
    kind: 'course',
    status: 'planned',
    icon: KIND_INFO[p.kind ?? 'course'].icon,
    color: '#3b82f6',
    createdAt: now,
    order: now,
    updatedAt: now,
    deleted: 0,
    dirty: 1,
    ...p,
  }
}

export const courseProgress = (c: Course) => (c.status === 'done' ? 1 : c.totalUnits ? Math.min(1, (c.doneUnits ?? 0) / c.totalUnits) : 0)

/**
 * Log a study session on a day. Finished units are added to the course (which also
 * moves a planned course to "learning", and a fully finished one to "done").
 */
export async function addStudy(date: string, log: Omit<StudyLog, 'id'>) {
  const cur = await db.journal.get(journalId(date))
  await saveJournal(date, { studies: [...(cur && !cur.deleted ? cur.studies ?? [] : []), { ...log, id: uid() }] })
  const c = await db.courses.get(log.courseId)
  if (!c) return
  const doneUnits = (c.doneUnits ?? 0) + (log.units ?? 0)
  const finished = !!c.totalUnits && doneUnits >= c.totalUnits
  await put('courses', {
    id: c.id,
    doneUnits,
    status: finished ? 'done' : c.status === 'planned' || c.status === 'paused' ? 'learning' : c.status,
    ...(finished && !c.doneAt ? { doneAt: Date.now() } : {}),
  })
}

/** Remove a logged session (and take its units back off the course) */
export async function removeStudy(date: string, id: string) {
  const cur = await db.journal.get(journalId(date))
  const log = cur?.studies?.find((s) => s.id === id)
  if (!cur || !log) return
  await saveJournal(date, { studies: (cur.studies ?? []).filter((s) => s.id !== id) })
  if (log.units) {
    const c = await db.courses.get(log.courseId)
    if (c) await put('courses', { id: c.id, doneUnits: Math.max(0, (c.doneUnits ?? 0) - log.units) })
  }
}

export interface CourseStats {
  minutes: number
  week: number
  sessions: number
  lastDate?: string
  /** consecutive days with a session, ending today or yesterday */
  streak: number
  history: { date: string; log: StudyLog }[]
}

export function courseStats(journals: Journal[], today = dayKey()): Map<string, CourseStats> {
  const m = new Map<string, CourseStats>()
  const weekAgo = dayKey(addDays(fromDayKey(today), -6))
  const days = new Map<string, Set<string>>()
  for (const j of journals)
    for (const s of j.studies ?? []) {
      const st = m.get(s.courseId) ?? { minutes: 0, week: 0, sessions: 0, streak: 0, history: [] }
      st.minutes += s.minutes
      if (j.date >= weekAgo && j.date <= today) st.week += s.minutes
      st.sessions++
      if (!st.lastDate || j.date > st.lastDate) st.lastDate = j.date
      st.history.push({ date: j.date, log: s })
      m.set(s.courseId, st)
      if (!days.has(s.courseId)) days.set(s.courseId, new Set())
      days.get(s.courseId)!.add(j.date)
    }
  for (const [id, st] of m) {
    st.history.sort((a, b) => (a.date < b.date ? 1 : -1))
    const set = days.get(id)!
    let d = fromDayKey(today)
    if (!set.has(today)) d = addDays(d, -1)
    while (set.has(dayKey(d))) {
      st.streak++
      d = addDays(d, -1)
    }
  }
  return m
}
