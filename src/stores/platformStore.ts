import { create } from 'zustand'
import { api, errorMessage, reportError } from '../lib/api.ts'
import { toast } from './toastStore.ts'
import type { Platform } from '../../shared/types.ts'

interface PlatformState {
  platforms: Platform[]
  loaded: boolean
  loadPlatforms: () => Promise<void>
  reset: () => void
}

export const usePlatformStore = create<PlatformState>((set) => ({
  platforms: [],
  loaded: false,
  loadPlatforms: async () => {
    try {
      set({ platforms: await api.getPlatforms(), loaded: true })
    } catch (err) {
      set({ loaded: true })
      reportError('載入平台失敗', err)
      toast.error(`載入平台失敗：${errorMessage(err)}`)
    }
  },
  reset: () => set({ platforms: [], loaded: false })
}))
