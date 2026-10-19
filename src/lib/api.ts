import type { ElectronAPI } from '../../shared/api.ts'

export const api: ElectronAPI = window.electronAPI

// ipcRenderer.invoke wraps errors as "Error invoking remote method 'posts:create': Error: 請輸入標題".
const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/

/** The message to show the user for an error thrown by an api call or by the page itself. */
export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(IPC_PREFIX, '') || '發生未知錯誤'
}

/** Sends a renderer error to the main log file; never throws, so it is safe inside error handlers. */
export function reportError(context: string, err: unknown): void {
  const detail = err instanceof Error ? err.stack : undefined
  api.logError(`${context}：${errorMessage(err)}`, detail).catch(() => undefined)
}
