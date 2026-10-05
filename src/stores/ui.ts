import { create } from 'zustand'
import type { Task } from '@/db/types'

interface UIState {
  editingTaskId?: string
  newTask?: Partial<Task>
  captureOpen: boolean
  capturePrefill?: string
  paletteOpen: boolean
  mobileNav: boolean
  openTask: (id?: string) => void
  createTask: (defaults?: Partial<Task>) => void
  closeTask: () => void
  openCapture: (prefill?: string) => void
  closeCapture: () => void
  setPalette: (o: boolean) => void
  setMobileNav: (o: boolean) => void
}

export const useUI = create<UIState>((set) => ({
  captureOpen: false,
  paletteOpen: false,
  mobileNav: false,
  openTask: (id) => set({ editingTaskId: id, newTask: undefined }),
  createTask: (defaults = {}) => set({ editingTaskId: undefined, newTask: defaults }),
  closeTask: () => set({ editingTaskId: undefined, newTask: undefined }),
  openCapture: (prefill) => set({ captureOpen: true, capturePrefill: prefill }),
  closeCapture: () => set({ captureOpen: false, capturePrefill: undefined }),
  setPalette: (o) => set({ paletteOpen: o }),
  setMobileNav: (o) => set({ mobileNav: o }),
}))
