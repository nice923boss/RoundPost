import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastState {
  toasts: Toast[]
  show: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

// Errors stay longer so there is time to read them.
const DURATION_MS: Record<ToastKind, number> = { info: 3000, success: 3000, error: 6000 }
const MAX_VISIBLE = 4
let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, kind = 'info') => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }].slice(-MAX_VISIBLE) }))
    setTimeout(() => get().dismiss(id), DURATION_MS[kind])
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  info: (message: string) => useToastStore.getState().show(message, 'info'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error')
}
