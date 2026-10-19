import { randomUUID } from 'node:crypto'
import { getGlobalDb } from '../connection.ts'
import { createLogger } from '../../services/logger.ts'
import type { Platform, PlatformInput } from '../../../shared/types.ts'

const log = createLogger('platforms')

// Short labels for platforms that sync files or imports create on the fly.
const DEFAULT_ICONS: Record<string, string> = {
  email: 'EM',
  blog: 'BG',
  youtube: 'YT',
  tiktok: 'TK',
  twitter: 'TW',
  x: 'X',
  linkedin: 'LI',
  pinterest: 'PI',
  wechat: 'WC',
  telegram: 'TG',
  whatsapp: 'WA'
}

export function getAllPlatforms(): Platform[] {
  return getGlobalDb().all<Platform>('SELECT * FROM platforms ORDER BY sort_order, name COLLATE NOCASE')
}

export function getPlatformById(id: string): Platform | undefined {
  return getGlobalDb().get<Platform>('SELECT * FROM platforms WHERE id = ?', [id])
}

/** Matches names the way people type them: surrounding spaces and letter case do not matter. */
export function findPlatformByName(name: string): Platform | undefined {
  return getGlobalDb().get<Platform>(
    'SELECT * FROM platforms WHERE trim(name) = ? COLLATE NOCASE ORDER BY sort_order LIMIT 1',
    [name.trim()]
  )
}

// Sync files and imports find platforms by name, so two platforms with the same name would be ambiguous.
function assertNameFree(name: string, ownId?: string): void {
  const other = findPlatformByName(name)
  if (other && other.id !== ownId) throw new Error(`已有名為「${other.name}」的平台`)
}

export function createPlatform(input: PlatformInput): Platform {
  assertNameFree(input.name)
  const db = getGlobalDb()
  const now = new Date().toISOString()
  const maxOrder = db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM platforms')?.m ?? 0
  const platform: Platform = {
    id: randomUUID(),
    name: input.name.trim(),
    url: input.url?.trim() ?? '',
    notes: input.notes ?? '',
    sort_order: maxOrder + 1,
    icon: input.icon?.trim() ?? '',
    created_at: now,
    updated_at: now
  }
  db.run(
    `INSERT INTO platforms (id, name, url, notes, sort_order, icon, created_at, updated_at)
     VALUES (@id, @name, @url, @notes, @sort_order, @icon, @created_at, @updated_at)`,
    { ...platform }
  )
  return platform
}

/** Finds a platform by name and creates it when a sync file names one that does not exist yet. */
export function ensurePlatform(name: string): Platform {
  const trimmed = name.trim()
  const existing = findPlatformByName(trimmed)
  if (existing) return existing
  const icon = DEFAULT_ICONS[trimmed.toLowerCase()] ?? [...trimmed].slice(0, 2).join('').toUpperCase()
  const created = createPlatform({ name: trimmed, icon })
  log.info(`自動建立平台：${trimmed}`)
  return created
}

export function updatePlatform(id: string, changes: Partial<PlatformInput>): Platform | undefined {
  const existing = getPlatformById(id)
  if (!existing) return undefined
  if (changes.name !== undefined) assertNameFree(changes.name, id)
  const updated: Platform = {
    ...existing,
    name: changes.name?.trim() ?? existing.name,
    url: changes.url?.trim() ?? existing.url,
    notes: changes.notes ?? existing.notes,
    icon: changes.icon?.trim() ?? existing.icon,
    updated_at: new Date().toISOString()
  }
  getGlobalDb().run(
    'UPDATE platforms SET name = @name, url = @url, notes = @notes, icon = @icon, updated_at = @updated_at WHERE id = @id',
    { id, name: updated.name, url: updated.url, notes: updated.notes, icon: updated.icon, updated_at: updated.updated_at }
  )
  return updated
}

/** Posts keep their link to a deleted platform under its last known name. */
export function deletePlatform(id: string): boolean {
  return getGlobalDb().run('DELETE FROM platforms WHERE id = ?', [id]).changes > 0
}
