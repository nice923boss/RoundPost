// Watches <sync folder>/sync/ for the Markdown files written by the HoloTeam post preparer.
import fs from 'node:fs'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import { processSyncFile } from './syncFile.ts'
import { createLogger } from './logger.ts'
import type { SyncEvent, SyncStatus } from '../../shared/types.ts'

const log = createLogger('sync')

const POST_PREPARER_FOLDER = '發文準備師'

let watcher: FSWatcher | null = null
let watchedFolder = ''
let lastEvent: SyncEvent | null = null

function isDirectory(folder: string): boolean {
  try {
    return fs.statSync(folder).isDirectory()
  } catch {
    return false
  }
}

function isSyncFile(file: string): boolean {
  return path.extname(file).toLowerCase() === '.md'
}

/**
 * The folder to store is the post preparer folder, the one that contains sync/. People often pick sync/ itself,
 * the 輸出 folder or the project folder instead, so those are mapped to the post preparer folder.
 */
export function normalizeSyncFolder(folder: string): string {
  const resolved = path.resolve(folder)
  if (path.basename(resolved).toLowerCase() === 'sync') return path.dirname(resolved)
  if (isDirectory(path.join(resolved, 'sync'))) return resolved
  for (const candidate of [path.join(resolved, POST_PREPARER_FOLDER), path.join(resolved, '輸出', POST_PREPARER_FOLDER)]) {
    if (isDirectory(candidate)) return candidate
  }
  return resolved
}

/** Starts watching folder/sync/. Files already there are read first; unchanged ones are skipped quietly. */
export async function startWatching(folder: string, onEvent: (event: SyncEvent) => void): Promise<void> {
  await stopWatching()
  watchedFolder = folder

  const emit = (event: SyncEvent): void => {
    lastEvent = event
    if (event.action === 'error') log.warn(`${event.file || folder}：${event.message ?? ''}`)
    onEvent(event)
  }
  const now = (): string => new Date().toISOString()

  // The sync folder may be on a drive that is not connected; do not create the path, just report it.
  if (!isDirectory(folder)) {
    emit({ file: '', action: 'error', message: `同步資料夾不存在：${folder}`, at: now() })
    return
  }
  const syncDir = path.join(folder, 'sync')
  if (!isDirectory(syncDir)) {
    try {
      fs.mkdirSync(syncDir)
    } catch (err) {
      emit({ file: '', action: 'error', message: `無法建立 sync 資料夾：${err instanceof Error ? err.message : String(err)}`, at: now() })
      return
    }
  }

  const current = watch(syncDir, {
    ignoreInitial: false,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  })
  watcher = current

  const onFile = (file: string): void => {
    if (watcher !== current || !isSyncFile(file)) return
    const event = processSyncFile(folder, file)
    if (event.action !== 'skipped') emit(event)
  }
  current.on('add', onFile)
  current.on('change', onFile)
  current.on('unlink', (file) => {
    if (watcher !== current || !isSyncFile(file)) return
    const rel = path.relative(folder, file).replaceAll('\\', '/')
    emit({ file: rel, action: 'removed', message: '同步檔已刪除，貼文保留', at: now() })
  })
  current.on('ready', () => log.info(`開始監控：${syncDir}`))
  current.on('error', (err) => log.error(`監控同步資料夾時發生錯誤：${syncDir}`, err))
}

export async function stopWatching(): Promise<void> {
  const current = watcher
  watcher = null
  watchedFolder = ''
  lastEvent = null
  if (!current) return
  await current.close()
  log.info('已停止監控同步資料夾')
}

export function getSyncStatus(): SyncStatus {
  return { folder: watchedFolder, watching: watcher !== null, lastEvent }
}
