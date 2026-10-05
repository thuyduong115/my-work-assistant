import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid() {
  return crypto.randomUUID()
}

/** 'YYYY-MM-DD' in local time */
export function dayKey(d: Date = new Date()) {
  return format(d, 'yyyy-MM-dd')
}

export function fromDayKey(k: string) {
  return parseISO(k)
}

export function fmtDay(k: string, pattern = 'EEEE, dd/MM') {
  return format(parseISO(k), pattern, { locale: vi })
}

export function fmtMin(min: number) {
  min = Math.round(min)
  if (min < 60) return `${min}p`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function fmtClock(sec: number) {
  sec = Math.max(0, Math.round(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function hhmmToMin(s: string) {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minToHHMM(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const COLORS = [
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#06b6d4', '#a855f7',
]
