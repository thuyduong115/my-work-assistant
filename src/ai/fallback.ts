import { addDays, getDay, nextDay, type Day } from 'date-fns'
import { dayKey } from '@/lib/utils'
import type { AITask, BreakdownResult } from './ai'

/** Word-bounded regex that understands Vietnamese letters (\b doesn't) */
const W = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}\\d])`, 'iu')

const WD: [string, Day][] = [
  ['chủ nhật|cn', 0],
  ['thứ 2|thứ hai|t2', 1],
  ['thứ 3|thứ ba|t3', 2],
  ['thứ 4|thứ tư|t4', 3],
  ['thứ 5|thứ năm|t5', 4],
  ['thứ 6|thứ sáu|t6', 5],
  ['thứ 7|thứ bảy|t7', 6],
]

/** Extract a date from Vietnamese text; returns [YYYY-MM-DD | null, text without the date] */
export function parseDate(text: string, now = new Date()): [string | null, string] {
  let s = text
  let date: Date | null = null
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => Date | null) => {
    if (date) return
    const m = s.match(re)
    if (m) {
      const d = fn(m)
      if (d) {
        date = d
        s = s.replace(m[0], ' ')
      }
    }
  }
  take(W('(?:(?:trước|hạn|deadline|vào|ngày)\\s*)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?'), (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear()
    let d = new Date(y, +m[2] - 1, +m[1])
    if (!m[3] && d < addDays(now, -1)) d = new Date(y + 1, +m[2] - 1, +m[1])
    return isNaN(d.getTime()) ? null : d
  })
  take(W('hôm nay|tối nay|sáng nay|chiều nay'), () => now)
  take(W('ngày kia|mốt'), () => addDays(now, 2))
  take(W('ngày mai|mai'), () => addDays(now, 1))
  for (const [src, wd] of WD) take(W(`(?:(?:trước|vào|hạn)\\s*)?(?:${src})(\\s+tuần sau|\\s+tới)?`), (m) => {
    let d = getDay(now) === wd ? now : nextDay(now, wd)
    if (m[1]) d = addDays(d, 7)
    return d
  })
  take(W('cuối tuần'), () => (getDay(now) === 0 ? now : nextDay(now, 0)))
  take(W('tuần sau|tuần tới'), () => addDays(now, 7))
  take(W('cuối tháng'), () => new Date(now.getFullYear(), now.getMonth() + 1, 0))
  return [date ? dayKey(date) : null, s.replace(/\s+/g, ' ').trim()]
}

export function parseDuration(text: string): [number | null, string] {
  const m = text.match(W('(\\d+(?:[.,]\\d+)?)\\s*(h|giờ|tiếng|p|ph|phút|m|min)'))
  if (!m) return [null, text]
  const n = parseFloat(m[1].replace(',', '.'))
  const min = /^(h|giờ|tiếng)$/i.test(m[2]) ? n * 60 : n
  return [Math.round(min / 5) * 5 || 5, text.replace(m[0], ' ').replace(/\s+/g, ' ').trim()]
}

/** Offline parser: one task per line / bullet / ";" */
export function fallbackBreakdown(input: string): BreakdownResult {
  let project: string | null = null
  const pm = input.match(/#([\p{L}\d_-]+)/u)
  if (pm) {
    project = pm[1].replace(/[_-]/g, ' ')
    input = input.replace(pm[0], ' ')
  }
  const parts = input
    .split(/\n|;|•/)
    .map((x) => x.replace(/^\s*([-*+]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
  const tasks: AITask[] = parts.map((p) => {
    let title = p
    let priority: AITask['priority'] = 'medium'
    if (/!!|gấp|khẩn/i.test(title)) priority = 'urgent'
    else if (/!|quan trọng/i.test(title)) priority = 'high'
    title = title.replace(/!+/g, '').replace(/(gấp|khẩn)/giu, '')
    const [deadline, t1] = parseDate(title)
    const [est, t2] = parseDuration(t1)
    const recurrence = /hằng ngày|mỗi ngày/i.test(t2) ? 'daily' : /hằng tuần|mỗi tuần/i.test(t2) ? 'weekly' : /hằng tháng|mỗi tháng/i.test(t2) ? 'monthly' : null
    const t3 = t2.replace(/(hằng|mỗi) (ngày|tuần|tháng)/giu, '').replace(/\s+/g, ' ').trim()
    return {
      title: t3.replace(/(trước|hạn|vào)\s*$/iu, '').trim() || p,
      estimateMin: est ?? 30,
      priority,
      deadline,
      recurrence,
      energy: 'high',
    }
  })
  return { project, projectIsNew: !!project, tasks, tip: 'Mẹo: thêm API key AI miễn phí trong Cài đặt để tự động chia nhỏ việc lớn.' }
}
