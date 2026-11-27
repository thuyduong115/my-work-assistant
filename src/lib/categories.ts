import { put } from '@/db/db'
import { useJournalRow } from '@/db/hooks'
import type { Task, TaskCategory } from '@/db/types'

export const CATEGORIES_ID = 'meta-categories'

export const DEFAULT_CATEGORIES: TaskCategory[] = [
  { id: 'work', name: 'Công việc', icon: '💼', color: '#0ea5e9' },
  { id: 'study', name: 'Học tập', icon: '📚', color: '#8b5cf6' },
  { id: 'personal', name: 'Cá nhân', icon: '🌸', color: '#ec4899' },
  { id: 'health', name: 'Sức khoẻ', icon: '💪', color: '#22c55e' },
  { id: 'home', name: 'Nhà cửa', icon: '🏠', color: '#f59e0b' },
]

/** The category list (synced as a journal meta row) */
export function useCategories(): TaskCategory[] {
  const row = useJournalRow(CATEGORIES_ID)
  return row?.categories?.length ? row.categories : DEFAULT_CATEGORIES
}

export const saveCategories = (categories: TaskCategory[]) => put('journal', { id: CATEGORIES_ID, date: 'meta', categories })

const RULES: [string, RegExp][] = [
  ['study', /(học|ôn|bài tập|btvn|thi\b|kiểm tra|môn|giáo trình|đọc (sách|paper|tài liệu)|paper|luận|nckh|nghiên cứu|lab|lớp|ielts|toeic|tiếng (anh|hàn|trung|nhật)|từ vựng|khoá học|course|study)/i],
  ['work', /(họp|meeting|báo cáo|report|khách hàng|email|mail|dự án|project|deadline|công ty|sếp|wbs|slide|thuyết trình|kế hoạch|code|deploy|review|task|hợp đồng|phỏng vấn)/i],
  ['health', /(tập|gym|chạy|yoga|bơi|đi bộ|thể dục|ngủ|khám|bác sĩ|thuốc|uống nước|thiền|vận động|skincare)/i],
  ['home', /(dọn|lau|giặt|nấu|rửa|đi chợ|siêu thị|mua sắm|sửa|tiền điện|tiền nước|hoá đơn|nhà)/i],
  ['personal', /(gọi|mẹ|bố|ba|gia đình|bạn|sinh nhật|du lịch|đọc truyện|xem phim|cà phê|hẹn)/i],
]

/** Category a task belongs to: chosen by hand, else guessed from its title */
export function taskCategory(t: Task, cats: TaskCategory[]): string {
  if (t.category && cats.some((c) => c.id === t.category)) return t.category
  for (const [id, re] of RULES) if (cats.some((c) => c.id === id) && re.test(t.title)) return id
  return cats.some((c) => c.id === 'personal') ? 'personal' : cats[0]?.id ?? ''
}
