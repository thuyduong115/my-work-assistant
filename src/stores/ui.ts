import { create } from 'zustand'
import type { Task } from '@/db/types'

export type CaptureMode = 'plan' | 'email'

interface UIState {
  editingTaskId?: string
  newTask?: Partial<Task>
  captureOpen: boolean
  capturePrefill?: string
  captureMode: CaptureMode
  ritual?: 'morning' | 'evening'
  ritualStep?: number
  templatesOpen: boolean
  /** study-log dialog: which day and (optionally) which course */
  studyLog?: { date: string; courseId?: string }
  paletteOpen: boolean
  twoMinTaskId?: string
  chatOpen: boolean
  chatPrefill?: string
  mobileNav: boolean
  openTask: (id?: string) => void
  createTask: (defaults?: Partial<Task>) => void
  closeTask: () => void
  openCapture: (prefill?: string, mode?: CaptureMode) => void
  openRitual: (r?: 'morning' | 'evening', step?: number) => void
  setTemplates: (o: boolean) => void
  openStudyLog: (v?: { date: string; courseId?: string }) => void
  closeCapture: () => void
  setPalette: (o: boolean) => void
  openTwoMin: (taskId?: string) => void
  setChat: (open: boolean, prefill?: string) => void
  setMobileNav: (o: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  captureOpen: false,
  captureMode: 'plan',
  templatesOpen: false,
  paletteOpen: false,
  chatOpen: false,
  mobileNav: false,
  openTask: (id) => set({ editingTaskId: id, newTask: undefined }),
  createTask: (defaults = {}) => set({ editingTaskId: undefined, newTask: defaults }),
  closeTask: () => set({ editingTaskId: undefined, newTask: undefined }),
  openCapture: (prefill, mode = 'plan') => set({ captureOpen: true, capturePrefill: prefill, captureMode: mode }),
  openRitual: (ritual, ritualStep = 0) => set({ ritual, ritualStep }),
  setTemplates: (templatesOpen) => set({ templatesOpen }),
  openStudyLog: (studyLog) => set({ studyLog }),
  closeCapture: () => set({ captureOpen: false, capturePrefill: undefined }),
  setPalette: (o) => set({ paletteOpen: o }),
  openTwoMin: (taskId) => set({ twoMinTaskId: taskId }),
  setChat: (open, prefill) => set({ chatOpen: open, chatPrefill: prefill }),
  setMobileNav: (o) => set({ mobileNav: o }),
}))
