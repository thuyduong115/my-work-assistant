import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { put } from '@/db/db'
import { uid } from '@/lib/utils'
import { useSettings } from './settings'

export type TimerMode = 'pomodoro' | 'stopwatch'
export type Phase = 'focus' | 'short' | 'long'

interface TimerState {
  mode: TimerMode
  phase: Phase
  running: boolean
  taskId?: string
  /** start of the current running segment */
  startedAt?: number
  /** ms accumulated in this phase before the current segment */
  accumulated: number
  cycles: number
  /** one-off focus length (e.g. the 2-minute starter); cleared when the phase ends */
  customMin?: number
  start: (opts?: { taskId?: string; mode?: TimerMode; minutes?: number }) => void
  pause: () => void
  resume: () => void
  stop: () => void
  skip: () => void
  setTask: (taskId?: string) => void
  completePhase: () => void
}

export function phaseMinutes(phase: Phase) {
  const custom = useTimer.getState().customMin
  if (phase === 'focus' && custom) return custom
  const p = useSettings.getState().pomodoro
  return phase === 'focus' ? p.focus : phase === 'short' ? p.short : p.long
}

export function elapsedMs(s: Pick<TimerState, 'running' | 'startedAt' | 'accumulated'>, now = Date.now()) {
  return s.accumulated + (s.running && s.startedAt ? now - s.startedAt : 0)
}

async function saveSegment(s: TimerState, end = Date.now()) {
  if (!s.running || !s.startedAt || s.phase !== 'focus') return
  if (end - s.startedAt < 60_000) return
  await put('timeEntries', { id: uid(), taskId: s.taskId, start: s.startedAt, end, kind: s.mode, deleted: 0 })
}

export const useTimer = create<TimerState>()(
  persist(
    (set, get) => ({
      mode: 'pomodoro',
      phase: 'focus',
      running: false,
      accumulated: 0,
      cycles: 0,
      start: (opts) => {
        const s = get()
        void saveSegment(s)
        set({
          customMin: opts?.minutes,
          mode: opts?.minutes ? 'pomodoro' : (opts?.mode ?? s.mode),
          taskId: opts?.taskId ?? s.taskId,
          phase: 'focus',
          running: true,
          startedAt: Date.now(),
          accumulated: 0,
        })
      },
      pause: () => {
        const s = get()
        if (!s.running) return
        void saveSegment(s)
        set({ running: false, accumulated: elapsedMs(s), startedAt: undefined })
      },
      resume: () => {
        if (get().running) return
        set({ running: true, startedAt: Date.now() })
      },
      stop: () => {
        void saveSegment(get())
        set({ running: false, startedAt: undefined, accumulated: 0, phase: 'focus', customMin: undefined })
      },
      skip: () => get().completePhase(),
      setTask: (taskId) => {
        const s = get()
        if (s.running) {
          void saveSegment(s)
          set({ taskId, startedAt: Date.now(), accumulated: elapsedMs(s) })
        } else set({ taskId })
      },
      completePhase: () => {
        const s = get()
        const st = useSettings.getState().pomodoro
        void saveSegment(s)
        if (s.phase === 'focus' && s.customMin) {
          // the 2-minute starter is done — momentum beats a break
          set({ customMin: undefined, accumulated: 0, running: false, startedAt: undefined })
          notify('⚡ Xong 2 phút!', 'Khó nhất là bắt đầu — làm tiếp một pomodoro nhé?')
          return
        }
        if (s.phase === 'focus') {
          const cycles = s.cycles + 1
          const phase: Phase = cycles % st.longEvery === 0 ? 'long' : 'short'
          set({ cycles, phase, accumulated: 0, running: st.autoBreak, startedAt: st.autoBreak ? Date.now() : undefined })
          notify('🍅 Xong 1 pomodoro!', `Nghỉ ${phaseMinutes(phase)} phút nhé.`)
        } else {
          set({ phase: 'focus', accumulated: 0, running: false, startedAt: undefined })
          notify('⏰ Hết giờ nghỉ', 'Quay lại tập trung nào!')
        }
      },
    }),
    { name: 'mwa-timer' },
  ),
)

// keep popup windows in sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'mwa-timer') void useTimer.persist.rehydrate()
  })
}

export function beep() {
  try {
    const ctx = new AudioContext()
    const notes = [880, 1175, 1568]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      o.type = 'sine'
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18)
      o.stop(ctx.currentTime + i * 0.18 + 0.32)
    })
  } catch {
    /* no audio */
  }
}

export function notify(title: string, body: string) {
  if (useSettings.getState().pomodoro.sound) beep()
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'pwa-192.png' })
  } catch {
    /* ignore */
  }
}
