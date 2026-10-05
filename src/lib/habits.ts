import type { Habit, HabitKind, HabitLog } from '@/db/types'

export const KIND_LABEL: Record<HabitKind, string> = {
  check: 'Tick hoàn thành',
  count: 'Đếm số lần',
  amount: 'Số lượng',
  duration: 'Thời gian',
}

export const habitKind = (h: Habit): HabitKind => h.kind ?? (h.target > 1 ? 'count' : 'check')
export const habitStep = (h: Habit) => (habitKind(h) === 'check' ? 1 : h.step && h.step > 0 ? h.step : 1)
export const habitUnit = (h: Habit) => {
  const k = habitKind(h)
  return k === 'duration' ? 'phút' : k === 'count' ? h.unit || 'lần' : k === 'amount' ? h.unit || '' : ''
}
export const habitTarget = (h: Habit) => (habitKind(h) === 'check' ? 1 : Math.max(h.goal === 'atMost' ? 0 : 1, h.target))

export function isHabitDone(h: Habit, value: number) {
  return h.goal === 'atMost' ? value <= habitTarget(h) : value >= habitTarget(h)
}

/** 0..1 progress toward the goal (for atMost: how much of the allowance is used) */
export function habitProgress(h: Habit, value: number) {
  const t = habitTarget(h)
  return t ? Math.min(1, value / t) : value > 0 ? 1 : 0
}

export function logValue(logs: HabitLog[], h: Habit, date: string) {
  return logs.find((l) => l.habitId === h.id && l.date === date)?.count ?? 0
}

/** 1500 ml → "1,5 L", 90 phút → "1h30" */
export function fmtAmount(v: number, unit: string) {
  const n = (x: number) => (Math.round(x * 100) / 100).toLocaleString('vi-VN')
  if (unit === 'ml' && v >= 1000) return `${n(v / 1000)} L`
  if (unit === 'g' && v >= 1000) return `${n(v / 1000)} kg`
  if (unit === 'phút' && v >= 60) return `${Math.floor(v / 60)}h${v % 60 ? String(Math.round(v % 60)).padStart(2, '0') : ''}`
  return unit ? `${n(v)} ${unit}` : n(v)
}

export const HABIT_TEMPLATES: (Partial<Habit> & { name: string; icon: string })[] = [
  { name: 'Uống đủ nước', icon: '💧', kind: 'amount', target: 2000, unit: 'ml', step: 250, quick: [100, 500], color: '#06b6d4' },
  { name: 'Đọc sách', icon: '📚', kind: 'amount', target: 20, unit: 'trang', step: 5, color: '#f97316' },
  { name: 'Vận động', icon: '🏃', kind: 'duration', target: 30, step: 10, color: '#22c55e' },
  { name: 'Thiền', icon: '🧘', kind: 'duration', target: 10, step: 5, color: '#a855f7' },
  { name: 'Học từ vựng', icon: '🇬🇧', kind: 'count', target: 10, unit: 'từ', step: 1, quick: [5], color: '#3b82f6' },
  { name: 'Đi bộ', icon: '👟', kind: 'amount', target: 6000, unit: 'bước', step: 1000, color: '#14b8a6' },
  { name: 'Cà phê', icon: '☕', kind: 'count', target: 2, unit: 'ly', goal: 'atMost', color: '#a16207' },
  { name: 'Mạng xã hội', icon: '📵', kind: 'duration', target: 30, step: 15, goal: 'atMost', color: '#ef4444' },
  { name: 'Ngủ trước 23h', icon: '🛌', kind: 'check', target: 1, color: '#6366f1' },
]
