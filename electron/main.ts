import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainEvent,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'node:path'
import icon from '../resources/256x256.png?asset'
import { initGlobalDb } from './db/connection.ts'
import { createLogger, getLogDir, initLogger } from './services/logger.ts'
import { closeWorkspace, openInitialProject, setSyncBroadcaster } from './services/workspace.ts'
import { registerAppHandlers, savedTheme } from './ipc/appHandlers.ts'
import { registerClipboardHandlers } from './ipc/clipboardHandlers.ts'
import { registerFileWatcherHandlers } from './ipc/fileWatcherHandlers.ts'
import { registerImportHandlers } from './ipc/importHandlers.ts'
import { registerPlatformHandlers } from './ipc/platformHandlers.ts'
import { registerPostHandlers } from './ipc/postHandlers.ts'
import { registerProjectHandlers } from './ipc/projectHandlers.ts'
import { registerTemplateHandlers } from './ipc/templateHandlers.ts'

const APP_TITLE = '串門子 RoundPost'
const isMac = process.platform === 'darwin'
const devRendererUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const devOrigin = devRendererUrl ? new URL(devRendererUrl).origin : null

// Logging starts first so that start-up failures are recorded too.
initLogger(join(app.getPath('userData'), 'logs'))
const log = createLogger('main')

let mainWindow: BrowserWindow | null = null
let cleanedUp = false
/** Set when quitting waits for the main window to save and close first. */
let quitRequested = false

function loadRoute(win: BrowserWindow, route: string): void {
  const loading = devRendererUrl
    ? win.loadURL(`${devRendererUrl}#${route}`)
    : win.loadFile(join(__dirname, '../renderer/index.html'), { hash: route })
  loading.catch((err) => log.error(`無法載入頁面 ${route}`, err))
}

function createWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    ...options,
    show: false,
    icon,
    // Matches --bg-primary in App.css, so the window does not flash white in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  })
  win.once('ready-to-show', () => win.show())
  // Keep the fixed window title instead of the page's <title>.
  win.on('page-title-updated', (event) => event.preventDefault())
  return win
}

function createMainWindow(): void {
  if (mainWindow) {
    mainWindow.focus()
    return
  }
  const win = createWindow({ width: 1280, height: 800, minWidth: 900, minHeight: 600, title: APP_TITLE })
  mainWindow = win
  let closeState: 'open' | 'saving' | 'saved' = 'open'
  win.on('close', (event) => {
    if (closeState === 'saved') return
    event.preventDefault()
    if (closeState === 'saving') return
    closeState = 'saving'
    void closeAfterSaving(win).then((close) => {
      closeState = close ? 'saved' : 'open'
      if (close) win.close()
      else quitRequested = false
    })
  })
  win.on('closed', () => {
    mainWindow = null
  })
  loadRoute(win, '/')
}

/** Asks the page to save open edits. False means saving failed; a page that does not answer in time counts as saved. */
function flushPageEdits(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      ipcMain.removeListener('app:flushDone', listener)
      resolve(ok)
    }
    const listener = (event: IpcMainEvent, ok: unknown) => {
      if (event.sender === win.webContents) finish(ok === true)
    }
    const timer = setTimeout(() => {
      log.warn('關閉前等待畫面儲存逾時')
      finish(true)
    }, 3000)
    ipcMain.on('app:flushDone', listener)
    win.webContents.send('app:flushRequest')
  })
}

/** True when the window may close: edits were saved, or the user chose to close without saving. */
async function closeAfterSaving(win: BrowserWindow): Promise<boolean> {
  if (await flushPageEdits(win)) return true
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: APP_TITLE,
    message: '目前的修改無法儲存',
    detail: '原因請看畫面上的錯誤訊息。仍要關閉嗎？未儲存的修改會遺失。',
    buttons: ['不儲存，直接關閉', '取消'],
    defaultId: 1,
    cancelId: 1
  })
  return response === 0
}

async function openMainWindow(): Promise<void> {
  await openInitialProject()
  createMainWindow()
}

function showAbout(): void {
  const options = {
    type: 'info' as const,
    title: `關於${APP_TITLE}`,
    message: APP_TITLE,
    detail: `版本 ${app.getVersion()}\n社群內容管理與發佈工具\n\n製作者：黃政文`,
    buttons: ['確定']
  }
  const parent = BrowserWindow.getFocusedWindow()
  void (parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options))
}

function openLogFolder(): void {
  const dir = getLogDir()
  if (!dir) return
  shell.openPath(dir).then((error) => {
    if (error) log.warn(`無法開啟記錄檔資料夾：${error}`)
  })
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: `關於${APP_TITLE}`, role: 'about' },
              { type: 'separator' },
              { label: '隱藏', role: 'hide' },
              { label: '隱藏其他', role: 'hideOthers' },
              { label: '全部顯示', role: 'unhide' },
              { type: 'separator' },
              { label: '結束', role: 'quit' }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: '檔案',
      submenu: [isMac ? { label: '關閉視窗', role: 'close' } : { label: '結束', role: 'quit' }]
    },
    {
      label: '編輯',
      submenu: [
        { label: '復原', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪下', role: 'cut' },
        { label: '複製', role: 'copy' },
        { label: '貼上', role: 'paste' },
        { label: '刪除', role: 'delete' },
        { type: 'separator' },
        { label: '全選', role: 'selectAll' }
      ]
    },
    {
      label: '檢視',
      submenu: [
        { label: '重新載入', role: 'reload' },
        { label: '強制重新載入', role: 'forceReload' },
        ...(!app.isPackaged ? [{ label: '開發者工具', role: 'toggleDevTools' } satisfies MenuItemConstructorOptions] : []),
        { type: 'separator' },
        { label: '實際大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '縮小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全螢幕', role: 'togglefullscreen' }
      ]
    },
    {
      label: '視窗',
      submenu: [
        { label: '最小化', role: 'minimize' },
        ...(isMac
          ? ([{ type: 'separator' }, { label: '移到最前面', role: 'front' }] satisfies MenuItemConstructorOptions[])
          : ([{ label: '關閉', role: 'close' }] satisfies MenuItemConstructorOptions[]))
      ]
    },
    {
      label: '說明',
      submenu: [
        { label: '開啟記錄檔資料夾', click: openLogFolder },
        ...(!isMac ? [{ label: `關於${APP_TITLE}`, click: showAbout } satisfies MenuItemConstructorOptions] : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return devOrigin ? parsed.origin === devOrigin : parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function openIfWebLink(url: string): void {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') void shell.openExternal(url)
  } catch {
    // Not a URL, nothing to open.
  }
}

// Pages never navigate away from the app; web links open in the default browser instead.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (details) => {
    if (isAppUrl(details.url)) return
    details.preventDefault()
    openIfWebLink(details.url)
  })
  contents.setWindowOpenHandler(({ url }) => {
    openIfWebLink(url)
    return { action: 'deny' }
  })
})

process.on('uncaughtException', (err) => {
  log.error('未預期的錯誤', err)
  dialog.showErrorBox('發生未預期的錯誤', `${err.message}\n\n記錄檔位置：${getLogDir() ?? ''}`)
})
process.on('unhandledRejection', (reason) => log.error('未處理的非同步錯誤', reason))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.roundpost.app')
    if (isMac) {
      app.setAboutPanelOptions({ applicationName: APP_TITLE, applicationVersion: app.getVersion(), credits: '製作者：黃政文' })
    }

    try {
      initGlobalDb(app.getPath('userData'))
    } catch (err) {
      log.error('無法開啟資料庫', err)
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('無法開啟資料庫', `${message}\n\n記錄檔位置：${getLogDir() ?? ''}`)
      app.exit(1)
      return
    }

    nativeTheme.themeSource = savedTheme()
    setSyncBroadcaster((event) => mainWindow?.webContents.send('sync:event', event))

    registerAppHandlers()
    registerClipboardHandlers()
    registerFileWatcherHandlers()
    registerImportHandlers()
    registerPlatformHandlers()
    registerPostHandlers()
    registerProjectHandlers()
    registerTemplateHandlers()
    buildMenu()

    try {
      await openMainWindow()
    } catch (err) {
      log.error('無法開啟專案', err)
      dialog.showErrorBox('無法開啟專案', `${err instanceof Error ? err.message : String(err)}\n\n記錄檔位置：${getLogDir() ?? ''}`)
      app.exit(1)
    }
  })

  app.on('window-all-closed', () => {
    if (!isMac || quitRequested) app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    openMainWindow().catch((err) => log.error('無法開啟視窗', err))
  })

  // Stop the watcher and close the databases before the process exits.
  app.on('before-quit', (event) => {
    if (cleanedUp) return
    event.preventDefault()
    // The window saves open edits while the databases are still open; closing it quits again.
    if (mainWindow) {
      quitRequested = true
      mainWindow.close()
      return
    }
    closeWorkspace()
      .catch((err) => log.error('關閉時清理失敗', err))
      .finally(() => {
        cleanedUp = true
        app.quit()
      })
  })
}
