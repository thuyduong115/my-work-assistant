import type { Habit, HabitLog, Journal, Task, TimeEntry } from '@/db/types'
import { activityByDay, bestStreak, focusByDay, habitStreak } from './stats'
import { dayKey } from './utils'

export interface Badge {
  id: string
  icon: string
  name: string
  desc: string
  /** current value toward the goal */
  value: number
  goal: number
}

/** Achievements derived from your data (nothing extra is stored) */
export function computeBadges(tasks: Task[], entries: TimeEntry[], habits: Habit[], logs: HabitLog[], journals: Journal[]): Badge[] {
  const done = tasks.filter((t) => t.status === 'done')
  const onTime = done.filter((t) => t.deadline && t.doneAt && dayKey(new Date(t.doneAt)) <= t.deadline).length
  const beatProcrastination = done.filter((t) => t.postponeCount >= 3).length
  const pomos = entries.filter((e) => e.kind === 'pomodoro' && e.end - e.start >= 20 * 60_000).length
  const act = activityByDay(tasks, entries, logs)
  const best = bestStreak([...act.entries()].filter(([, v]) => v.productive).map(([k]) => k))
  const maxFocusDay = Math.max(0, ...focusByDay(entries).values())
  const earlyDays = new Set(entries.filter((e) => new Date(e.start).getHours() < 8).map((e) => dayKey(new Date(e.start)))).size
  const bestHabit = Math.max(0, ...habits.filter((h) => !h.archived).map((h) => habitStreak(h, logs)))
  const evenings = journals.filter((j) => j.eveningAt).length
  const mornings = journals.filter((j) => j.morningAt).length
  const top3Days = journals.filter((j) => j.top3?.length && j.top3.every((id) => tasks.find((t) => t.id === id)?.status === 'done')).length

  return [
    { id: 'first', icon: '🌱', name: 'Khởi đầu', desc: 'Hoàn thành task đầu tiên', value: done.length, goal: 1 },
    { id: 'done50', icon: '💪', name: 'Chăm chỉ', desc: 'Hoàn thành 50 task', value: done.length, goal: 50 },
    { id: 'done200', icon: '🏆', name: 'Bậc thầy', desc: 'Hoàn thành 200 task', value: done.length, goal: 200 },
    { id: 'ontime', icon: '⏱️', name: 'Đúng hẹn', desc: '20 task xong trước hoặc đúng hạn', value: onTime, goal: 20 },
    { id: 'frog', icon: '🐸', name: 'Ăn con ếch', desc: 'Hoàn thành 3 task từng bị dời ≥ 3 lần', value: beatProcrastination, goal: 3 },
    { id: 'streak7', icon: '🔥', name: 'Giữ lửa', desc: 'Chuỗi 7 ngày làm việc', value: best, goal: 7 },
    { id: 'streak30', icon: '🌋', name: 'Không thể cản', desc: 'Chuỗi 30 ngày làm việc', value: best, goal: 30 },
    { id: 'pomo10', icon: '🍅', name: 'Cà chua', desc: '10 pomodoro', value: pomos, goal: 10 },
    { id: 'pomo100', icon: '🧺', name: 'Vườn cà chua', desc: '100 pomodoro', value: pomos, goal: 100 },
    { id: 'deep', icon: '🧠', name: 'Tập trung sâu', desc: 'Một ngày tập trung ≥ 4 giờ', value: Math.round(maxFocusDay), goal: 240 },
    { id: 'early', icon: '🌅', name: 'Chim sớm', desc: '5 ngày bắt đầu làm trước 8h', value: earlyDays, goal: 5 },
    { id: 'habit21', icon: '🌿', name: 'Thói quen mới', desc: 'Giữ 1 thói quen 21 ngày liền', value: bestHabit, goal: 21 },
    { id: 'top3', icon: '🎯', name: 'Trúng đích', desc: '5 ngày xong cả 3 việc chính', value: top3Days, goal: 5 },
    { id: 'morning', icon: '☀️', name: 'Nghi thức sáng', desc: 'Lên kế hoạch buổi sáng 7 lần', value: mornings, goal: 7 },
    { id: 'evening', icon: '🌙', name: 'Nhìn lại', desc: 'Tổng kết ngày 7 lần', value: evenings, goal: 7 },
  ]
}

export const earned = (b: Badge) => b.value >= b.goal
