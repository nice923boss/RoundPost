import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import { z } from 'zod'
import { handle } from './handle.ts'
import { ColumnMapping } from './schemas.ts'
import { IMPORT_EXTENSIONS, importFile, previewImport } from '../services/importService.ts'
import type { ImportSelection } from '../../shared/api.ts'

// The renderer never passes a path: it can only import the file the user picked in the dialog.
let chosenFile: string | null = null

export function registerImportHandlers(): void {
  handle('import:choose', z.tuple([]), async (_args, event): Promise<ImportSelection | null> => {
    const options: OpenDialogOptions = {
      title: '選擇要匯入的檔案',
      properties: ['openFile'],
      filters: [{ name: '試算表或文字檔', extensions: [...IMPORT_EXTENSIONS] }]
    }
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    const preview = previewImport(file)
    chosenFile = file
    return { file, preview }
  })

  handle('import:run', z.tuple([ColumnMapping]), ([mapping]) => {
    if (!chosenFile) throw new Error('請先選擇要匯入的檔案')
    return importFile(chosenFile, mapping)
  })
}
