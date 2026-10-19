import fs from 'node:fs'
import path from 'node:path'

// Minimal file logger for the main process. Writes one file per local day and keeps two weeks.
// Before initLogger() runs (or in tests) warnings and errors go to stderr.

type Level = 'INFO' | 'WARN' | 'ERROR'

const KEEP_DAYS = 14
const FILE_RE = /^main-(\d{4}-\d{2}-\d{2})\.log$/

let logDir: string | null = null

function localDate(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pruneOldLogs(dir: string): void {
  const cutoff = localDate(new Date(Date.now() - KEEP_DAYS * 86_400_000))
  for (const name of fs.readdirSync(dir)) {
    const match = FILE_RE.exec(name)
    if (match && match[1] < cutoff) fs.rmSync(path.join(dir, name), { force: true })
  }
}

export function initLogger(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  logDir = dir
  try {
    pruneOldLogs(dir)
  } catch (err) {
    write('WARN', 'logger', '清理舊記錄檔失敗', err)
  }
}

export function getLogDir(): string | null {
  return logDir
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`
  return String(err)
}

function write(level: Level, scope: string, message: string, err?: unknown): void {
  const detail = err === undefined ? '' : `\n${formatError(err)}`
  const line = `${new Date().toISOString()} ${level} [${scope}] ${message}${detail}\n`
  if (logDir) {
    try {
      fs.appendFileSync(path.join(logDir, `main-${localDate()}.log`), line, 'utf8')
      return
    } catch {
      // Fall through to stderr so the message is not lost.
    }
  }
  if (level !== 'INFO') process.stderr.write(line)
}

export interface Logger {
  info(message: string): void
  warn(message: string, err?: unknown): void
  error(message: string, err?: unknown): void
}

export function createLogger(scope: string): Logger {
  return {
    info: (message) => write('INFO', scope, message),
    warn: (message, err) => write('WARN', scope, message, err),
    error: (message, err) => write('ERROR', scope, message, err)
  }
}
