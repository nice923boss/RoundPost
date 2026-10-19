import { app, nativeTheme, shell } from 'electron'
import { z } from 'zod'
import { handle } from './handle.ts'
import { LogText, ThemeName } from './schemas.ts'
import { getSetting, setSetting } from '../db/repositories/settingsRepository.ts'
import { createLogger, getLogDir } from '../services/logger.ts'
import { THEMES, type AppInfo, type Theme } from '../../shared/types.ts'

const rendererLog = createLogger('renderer')

export function savedTheme(): Theme {
  const value = getSetting('theme')
  return THEMES.find((theme) => theme === value) ?? 'system'
}

export function registerAppHandlers(): void {
  handle('settings:getTheme', z.tuple([]), () => savedTheme())

  handle('settings:setTheme', z.tuple([ThemeName]), ([theme]) => {
    setSetting('theme', theme)
    nativeTheme.themeSource = theme
  })

  handle(
    'app:info',
    z.tuple([]),
    (): AppInfo => ({ version: app.getVersion(), userDataDir: app.getPath('userData'), logDir: getLogDir() ?? '' })
  )

  handle('app:openLogFolder', z.tuple([]), async () => {
    const dir = getLogDir()
    if (!dir) throw new Error('記錄檔資料夾尚未建立')
    const error = await shell.openPath(dir)
    if (error) throw new Error(`無法開啟記錄檔資料夾：${error}`)
  })

  // Errors from the pages end up in the same log file as the main process.
  handle('log:renderer', z.tuple([LogText, LogText.optional()]), ([message, detail]) => {
    rendererLog.error(detail ? `${message}\n${detail}` : message)
  })
}
