import fs from 'node:fs'
import path from 'node:path'
import { Db } from './db.ts'
import { migrateGlobalDb, migrateProjectDb } from './schema.ts'
import { createLogger } from '../services/logger.ts'

// Holds the global database and the one open project database.
// Kept free of Electron imports so tests can open databases in a temporary folder.

const log = createLogger('connection')
const GLOBAL_DB_FILE = 'roundpost-global.db'

let dataDir: string | null = null
let globalDb: Db | null = null
let projectDb: Db | null = null
let projectId: string | null = null

function openMigrated(file: string, migrate: (db: Db) => void): Db {
  const db = new Db(file)
  try {
    migrate(db)
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

export function initGlobalDb(userDataDir: string): Db {
  fs.mkdirSync(userDataDir, { recursive: true })
  closeAllDbs()
  dataDir = userDataDir
  globalDb = openMigrated(path.join(userDataDir, GLOBAL_DB_FILE), migrateGlobalDb)
  return globalDb
}

export function getDataDir(): string {
  if (!dataDir) throw new Error('資料庫尚未初始化')
  return dataDir
}

export function getGlobalDb(): Db {
  if (!globalDb) throw new Error('資料庫尚未初始化')
  return globalDb
}

/** Project files live in the data folder. A path stored on another computer falls back to the same file name here. */
export function resolveProjectDbPath(stored: string): string {
  if (fs.existsSync(stored)) return stored
  const local = path.join(getDataDir(), path.basename(stored.replace(/\\/g, '/')))
  if (local !== stored) log.info(`專案資料庫路徑改用本機位置：${stored} → ${local}`)
  return local
}

export function openProjectDb(file: string, id: string): Db {
  closeProjectDb()
  projectDb = openMigrated(file, migrateProjectDb)
  projectId = id
  return projectDb
}

export function getProjectDb(): Db {
  if (!projectDb) throw new Error('尚未開啟任何專案')
  return projectDb
}

/** Id of the project whose database is open, or null. */
export function getOpenProjectId(): string | null {
  return projectId
}

export function closeProjectDb(): void {
  projectDb?.close()
  projectDb = null
  projectId = null
}

export function closeAllDbs(): void {
  closeProjectDb()
  globalDb?.close()
  globalDb = null
}
