// Registers ipcMain handlers that check the caller and the arguments before doing any work.
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { createLogger } from '../services/logger.ts'

z.config(z.locales.zhTW())

const log = createLogger('ipc')
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const devOrigin = devUrl ? new URL(devUrl).origin : null

/** Only the app's own top-level pages may call the main process. */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (!frame || frame.parent !== null) return false
  try {
    const url = new URL(frame.url)
    return devOrigin ? url.origin === devOrigin : url.protocol === 'file:'
  } catch {
    return false
  }
}

export function handle<S extends z.ZodType>(
  channel: string,
  schema: S,
  fn: (args: z.output<S>, event: IpcMainInvokeEvent) => unknown
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isTrustedSender(event)) {
      log.warn(`${channel} 拒絕來源不明的請求：${event.senderFrame?.url ?? '（已關閉的頁面）'}`)
      throw new Error('拒絕來源不明的請求')
    }
    const parsed = schema.safeParse(args)
    if (!parsed.success) {
      log.warn(`${channel} 參數錯誤：${z.prettifyError(parsed.error)}`)
      throw new Error(parsed.error.issues[0]?.message ?? '輸入資料格式錯誤')
    }
    try {
      return await fn(parsed.data, event)
    } catch (err) {
      log.error(`${channel} 失敗`, err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}
