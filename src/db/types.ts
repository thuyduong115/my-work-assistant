export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type Energy = 'high' | 'low'
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

/** Fields every synced record has */
export interface Base {
  id: string
  updatedAt: number
  deleted: 0 | 1
  dirty: 0 | 1
}

export interface Role extends Base {
  name: string
  color: string
  icon: string
  description?: string
}

export interface Project extends Base {
  name: string
  roleId?: string
  color: string
  icon?: string
  status: 'active' | 'paused' | 'done'
  deadline?: string
  description?: string
  createdAt: number
}

/** A planned work block on the calendar */
export interface PlanBlock {
  date: string // YYYY-MM-DD
  start: string // HH:mm
  min: number
}

export interface Task extends Base {
  title: string
  notes?: string
  projectId?: string
  roleId?: string
  parentId?: string
  status: TaskStatus
  priority: Priority
  estimateMin: number
  deadline?: string // YYYY-MM-DD
  deadlineTime?: string // HH:mm
  /** Day the user wants to do it (manual) */
  scheduledDate?: string
  /** optional exact start time on scheduledDate (HH:mm) */
  scheduledTime?: string
  plan?: PlanBlock[]
  /** if true, auto-scheduler keeps the plan */
  pinned?: boolean
  energy?: Energy
  recurrence?: Recurrence
  /** Eisenhower quadrant chosen by hand (overrides the deadline-based guess) */
  matrix?: 'do' | 'plan' | 'delegate' | 'drop'
  postponeCount: number
  /** last planned day that was skipped (already counted) */
  lastMissed?: string
  order: number
  createdAt: number
  doneAt?: number
  tags?: string[]
}

export interface TimeEntry extends Base {
  taskId?: string
  start: number
  end: number
  kind: 'pomodoro' | 'stopwatch'
}

export type HabitKind = 'check' | 'count' | 'amount' | 'duration'

export interface Habit extends Base {
  name: string
  icon: string
  color: string
  /** check = tick once · count = times · amount = quantity with a unit · duration = minutes */
  kind?: HabitKind
  /** daily goal (times / quantity / minutes) */
  target: number
  unit?: string
  /** added per tap */
  step?: number
  /** extra quick-add buttons */
  quick?: number[]
  /** atLeast = reach the goal (water) · atMost = stay under it (coffee, social media) */
  goal?: 'atLeast' | 'atMost'
  /** active weekdays, 0 = Sunday */
  days: number[]
  archived?: boolean
  createdAt: number
  order: number
}

export interface HabitLog extends Base {
  habitId: string
  date: string
  count: number
}

/** One per day: morning plan + evening review (id = "j-YYYY-MM-DD") */
export interface Journal extends Base {
  date: string
  /** the day's 3 most important task ids */
  top3?: string[]
  /** 1 (drained) … 5 (full of energy) */
  energy?: number
  intention?: string
  morningAt?: number
  /** 1 (bad) … 5 (great) */
  mood?: number
  win?: string
  note?: string
  eveningAt?: number
  /** times the focus guard caught you leaving the tab */
  distractions?: number
}

export type TableName = 'roles' | 'projects' | 'tasks' | 'timeEntries' | 'habits' | 'habitLogs' | 'journal'
export const TABLES: TableName[] = ['roles', 'projects', 'tasks', 'timeEntries', 'habits', 'habitLogs', 'journal']

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
  urgent: 'Gấp',
}
export const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#94a3b8',
  medium: '#3b82f6',
  high: '#f97316',
  urgent: '#ef4444',
}
export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  done: 'Hoàn thành',
}
export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: 'Hằng ngày',
  weekdays: 'Ngày làm việc (T2–T6)',
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
}
