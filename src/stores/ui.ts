import { create } from 'zustand'
import type { Task } from '@/db/types'

interface UIState {
  editingTaskId?: string
  newTask?: Partial<Task>
  captureOpen: boolean
  capturePrefill?: string
  paletteOpen: boolean
  twoMinTaskId?: string
  chatOpen: boolean
  chatPrefill?: string
  mobileNav: boolean
  openTask: (id?: string) => void
  createTask: (defaults?: Partial<Task>) => void
  closeTask: () => void
  openCapture: (prefill?: string) => void
  closeCapture: () => void
  setPalette: (o: boolean) => void
  openTwoMin: (taskId?: string) => void
  setChat: (open: boolean, prefill?: string) => void
  setMobileNav: (o: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  captureOpen: false,
  paletteOpen: false,
  chatOpen: false,
  mobileNav: false,
  openTask: (id) => set({ editingTaskId: id, newTask: undefined }),
  createTask: (defaults = {}) => set({ editingTaskId: undefined, newTask: defaults }),
  closeTask: () => set({ editingTaskId: undefined, newTask: undefined }),
  openCapture: (prefill) => set({ captureOpen: true, capturePrefill: prefill }),
  closeCapture: () => set({ captureOpen: false, capturePrefill: undefined }),
  setPalette: (o) => set({ paletteOpen: o }),
  openTwoMin: (taskId) => set({ twoMinTaskId: taskId }),
  setChat: (open, prefill) => set({ chatOpen: open, chatPrefill: prefill }),
  setMobileNav: (o) => set({ mobileNav: o }),
}))
