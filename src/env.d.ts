import type { ElectronAPI } from '../shared/api.ts'

declare global {
  interface Window {
    /** Provided by electron/preload.ts. */
    electronAPI: ElectronAPI
  }
}

export {}
