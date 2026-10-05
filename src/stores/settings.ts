import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'
export type Accent = 'violet' | 'pink' | 'teal' | 'orange' | 'blue' | 'green'
export type AIProvider = 'gemini' | 'groq' | 'openrouter' | 'none'

export interface Settings {
  theme: Theme
  accent: Accent
  /** weekday (0=CN) → "19:00-22:00, 08:00-11:00" */
  workHours: Record<number, string>
  bufferPct: number
  autoSchedule: boolean
  maxBlockMin: number
  ai: { provider: AIProvider; keys: Partial<Record<AIProvider, string>>; model: Partial<Record<AIProvider, string>> }
  supabase: { url: string; anonKey: string }
  pomodoro: { focus: number; short: number; long: number; longEvery: number; autoBreak: boolean; sound: boolean }
  dailyGoalMin: number
  set: (patch: Partial<Omit<Settings, 'set'>>) => void
}

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  none: '',
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'violet',
      workHours: {
        0: '09:00-11:00',
        1: '19:00-22:00',
        2: '19:00-22:00',
        3: '19:00-22:00',
        4: '19:00-22:00',
        5: '19:00-22:00',
        6: '08:30-11:30, 14:00-17:00',
      },
      bufferPct: 20,
      autoSchedule: true,
      maxBlockMin: 90,
      ai: { provider: 'gemini', keys: {}, model: {} },
      supabase: { url: import.meta.env.VITE_SUPABASE_URL ?? '', anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '' },
      pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, sound: true },
      dailyGoalMin: 120,
      set: (patch) => set(patch),
    }),
    {
      name: 'mwa-settings',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>
        const merged = { ...current, ...p }
        // build-time Supabase config fills blanks
        if (!merged.supabase?.url) merged.supabase = current.supabase
        return merged
      },
    },
  ),
)

export function parseSlots(s: string): [number, number][] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [a, b] = x.split('-').map((y) => y.trim())
      const [ah, am] = (a ?? '').split(':').map(Number)
      const [bh, bm] = (b ?? '').split(':').map(Number)
      return [(ah || 0) * 60 + (am || 0), (bh || 0) * 60 + (bm || 0)] as [number, number]
    })
    .filter(([a, b]) => b > a)
}

export function applyTheme(theme: Theme, accent: Accent) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.accent = accent
  try {
    localStorage.setItem('mwa-theme', theme)
    localStorage.setItem('mwa-accent', accent)
  } catch {
    /* ignore */
  }
}
