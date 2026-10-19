import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite'
import { createLogger } from '../services/logger.ts'

const log = createLogger('db')

export type Row = Record<string, unknown>
/** Named parameters (@name) or positional parameters (?). */
export type Params = Record<string, unknown> | unknown[]

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value
  if (value instanceof Uint8Array) return value
  throw new TypeError(`無法寫入資料庫的值型別：${typeof value}`)
}

function named(params: Record<string, unknown>): Record<string, SQLInputValue> {
  const out: Record<string, SQLInputValue> = {}
  for (const [key, value] of Object.entries(params)) out[key] = toSqlValue(value)
  return out
}

function positional(params: unknown[] | undefined): SQLInputValue[] {
  return params ? params.map(toSqlValue) : []
}

/** node:sqlite returns null-prototype rows; copy them so IPC and deep equality treat them as plain objects. */
function plain<T>(row: Record<string, unknown>): T {
  return { ...row } as T
}

/** Thin synchronous wrapper over node:sqlite with statement caching. */
export class Db {
  readonly path: string
  private readonly db: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()

  constructor(path: string) {
    this.path = path
    this.db = new DatabaseSync(path, { timeout: 5000 })
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
  }

  private statement(sql: string): StatementSync {
    let stmt = this.statements.get(sql)
    if (!stmt) {
      stmt = this.db.prepare(sql)
      this.statements.set(sql, stmt)
    }
    return stmt
  }

  all<T = Row>(sql: string, params?: Params): T[] {
    const stmt = this.statement(sql)
    const rows = params && !Array.isArray(params) ? stmt.all(named(params)) : stmt.all(...positional(params))
    return rows.map((row) => plain<T>(row))
  }

  get<T = Row>(sql: string, params?: Params): T | undefined {
    const stmt = this.statement(sql)
    const row = params && !Array.isArray(params) ? stmt.get(named(params)) : stmt.get(...positional(params))
    return row ? plain<T>(row) : undefined
  }

  run(sql: string, params?: Params): { changes: number } {
    const stmt = this.statement(sql)
    const result = params && !Array.isArray(params) ? stmt.run(named(params)) : stmt.run(...positional(params))
    return { changes: Number(result.changes) }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  /** Runs fn inside BEGIN IMMEDIATE ... COMMIT; nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** Writes a compacted copy of the database. The target file must not exist yet. */
  backupTo(file: string): void {
    this.db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`)
  }

  get isOpen(): boolean {
    return this.db.isOpen
  }

  close(): void {
    if (!this.db.isOpen) return
    try {
      this.db.exec('PRAGMA optimize')
    } catch (err) {
      log.warn(`PRAGMA optimize 失敗：${this.path}`, err)
    }
    this.statements.clear()
    this.db.close()
  }
}
