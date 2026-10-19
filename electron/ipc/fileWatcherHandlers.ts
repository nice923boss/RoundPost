import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { handle } from './handle.ts'
import { getSyncStatus } from '../services/fileWatcherService.ts'
import { setSyncFolder } from '../services/workspace.ts'

export function registerFileWatcherHandlers(): void {
  handle('sync:chooseFolder', z.tuple([]), async (_args, event) => {
    const options: OpenDialogOptions = { title: '選擇同步資料夾', properties: ['openDirectory'] }
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return null
    return setSyncFolder(folder)
  })

  handle('sync:clearFolder', z.tuple([]), () => setSyncFolder(''))

  handle('sync:status', z.tuple([]), () => getSyncStatus())
}
