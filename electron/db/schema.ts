import fs from 'node:fs'
import type { Db } from './db.ts'
import { htmlToPlainText, looksLikeHtml, plainTextToHtml, sanitizeHtml } from '../services/html.ts'
import { markdownToHtml } from '../services/markdown.ts'
import { createLogger } from '../services/logger.ts'

const log = createLogger('schema')

interface Migration {
  version: number
  up: (db: Db) => void
}

function readVersion(db: Db): number {
  db.exec('CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL)')
  return db.get<{ version: number }>('SELECT version FROM _schema_version LIMIT 1')?.version ?? 0
}

/** Keeps a copy of the file before an existing database is upgraded. VACUUM INTO cannot run inside a transaction. */
function backupBeforeUpgrade(db: Db, from: number): void {
  if (db.path === ':memory:') return
  const target = `${db.path}.v${from}.bak`
  if (fs.existsSync(target)) return
  try {
    db.backupTo(target)
    log.info(`升級前備份：${target}`)
  } catch (err) {
    log.warn(`升級前備份失敗，仍繼續升級：${target}`, err)
  }
}

/** Applies pending migrations in one transaction, so a failure leaves the database untouched. */
function migrate(db: Db, label: string, migrations: Migration[]): void {
  const from = readVersion(db)
  const latest = migrations[migrations.length - 1].version
  if (from > latest) {
    log.warn(`${label}資料庫版本 v${from} 比此程式支援的 v${latest} 新：${db.path}`)
    return
  }
  const pending = migrations.filter((m) => m.version > from)
  if (pending.length === 0) return
  if (from > 0) backupBeforeUpgrade(db, from)
  db.transaction(() => {
    for (const m of pending) m.up(db)
    if (from === 0) db.run('INSERT INTO _schema_version (version) VALUES (?)', [latest])
    else db.run('UPDATE _schema_version SET version = ?', [latest])
  })
  log.info(`${label}資料庫 v${from} 升級到 v${latest}：${db.path}`)
}

// Global database: projects, platforms and settings shared by every project.

const DEFAULT_PLATFORMS = [
  { id: 'plat-facebook', name: 'Facebook', url: 'https://www.facebook.com/', icon: 'FB', sort_order: 1, notes: '' },
  { id: 'plat-instagram', name: 'Instagram', url: 'https://www.instagram.com/', icon: 'IG', sort_order: 2, notes: '' },
  { id: 'plat-threads', name: 'Threads', url: 'https://www.threads.net/', icon: 'TH', sort_order: 3, notes: '' },
  { id: 'plat-line', name: 'LINE', url: 'https://manager.line.biz/', icon: 'LN', sort_order: 4, notes: 'LINE Official Account Manager' },
  { id: 'plat-accupass', name: 'ACCUPASS', url: 'https://www.accupass.com/manager/', icon: 'AP', sort_order: 5, notes: 'ACCUPASS Manager' }
]

const GLOBAL_MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          db_path TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS platforms (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT DEFAULT '',
          notes TEXT DEFAULT '',
          sort_order INTEGER DEFAULT 0,
          icon TEXT DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)
      if ((db.get<{ c: number }>('SELECT COUNT(*) AS c FROM platforms')?.c ?? 0) > 0) return
      const now = new Date().toISOString()
      for (const p of DEFAULT_PLATFORMS) {
        db.run(
          `INSERT INTO platforms (id, name, url, notes, sort_order, icon, created_at, updated_at)
           VALUES (@id, @name, @url, @notes, @sort_order, @icon, @now, @now)`,
          { ...p, now }
        )
      }
    }
  },
  {
    // Sync folders moved from one global setting to a column per project.
    version: 2,
    up: (db) => {
      const hasColumn = db.get<{ c: number }>("SELECT COUNT(*) AS c FROM pragma_table_info('projects') WHERE name = 'sync_folder'")
      if (!hasColumn?.c) db.exec("ALTER TABLE projects ADD COLUMN sync_folder TEXT DEFAULT ''")

      const legacy = db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'sync_folder_path'")
      if (!legacy) return
      if (legacy.value) {
        const active = db.get<{ id: string }>(
          "SELECT p.id FROM projects p JOIN settings s ON s.key = 'last_active_project' AND s.value = p.id"
        )
        const target = active?.id ?? db.get<{ id: string }>('SELECT id FROM projects ORDER BY created_at LIMIT 1')?.id
        if (target) db.run('UPDATE projects SET sync_folder = ? WHERE id = ?', [legacy.value, target])
      }
      db.run("DELETE FROM settings WHERE key = 'sync_folder_path'")
    }
  }
]

// Project database: posts, their platforms and templates for one project.

/** Old sync_source values are absolute paths from the computer that synced them; keep the part from sync/ on. */
export function toRelativeSyncSource(source: string): string {
  const normalized = source.replace(/\\/g, '/')
  const lower = normalized.toLowerCase()
  if (lower.startsWith('sync/')) return normalized
  const index = lower.lastIndexOf('/sync/')
  if (index >= 0) return `sync/${normalized.slice(index + '/sync/'.length)}`
  return `sync/${normalized.slice(normalized.lastIndexOf('/') + 1)}`
}

interface LegacyPostRow {
  id: string
  content: string
  content_html: string | null
  sync_source: string | null
}

/**
 * Version 1 stored editor HTML in content for posts edited in the app, Markdown for synced posts and plain
 * text for imported ones. From version 2 content_html is the source of truth and content is its plain text.
 */
function legacyContentToHtml(row: LegacyPostRow): string {
  if (looksLikeHtml(row.content)) return sanitizeHtml(row.content)
  if (!row.content.trim()) return sanitizeHtml(row.content_html ?? '')
  return row.sync_source ? markdownToHtml(row.content) : plainTextToHtml(row.content)
}

const SEARCH_INDEX_SQL = `
  CREATE VIRTUAL TABLE posts_fts USING fts5(post_id UNINDEXED, title, body, tokenize='trigram');
  CREATE TRIGGER posts_fts_ai AFTER INSERT ON posts BEGIN
    INSERT INTO posts_fts (post_id, title, body) VALUES (new.id, new.title, new.content);
  END;
  CREATE TRIGGER posts_fts_ad AFTER DELETE ON posts BEGIN
    DELETE FROM posts_fts WHERE post_id = old.id;
  END;
  CREATE TRIGGER posts_fts_au AFTER UPDATE OF id, title, content ON posts BEGIN
    DELETE FROM posts_fts WHERE post_id = old.id;
    INSERT INTO posts_fts (post_id, title, body) VALUES (new.id, new.title, new.content);
  END;
  INSERT INTO posts_fts (post_id, title, body) SELECT id, title, content FROM posts;
`

const PROJECT_MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS posts (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          content_html TEXT DEFAULT '',
          scheduled_date TEXT,
          scheduled_time TEXT,
          status TEXT NOT NULL DEFAULT 'draft',
          template_id TEXT,
          sync_source TEXT,
          sync_hash TEXT,
          source_skill TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS post_platforms (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          platform_id TEXT NOT NULL,
          platform_name TEXT NOT NULL,
          published INTEGER NOT NULL DEFAULT 0,
          published_at TEXT,
          UNIQUE(post_id, platform_id)
        );
        CREATE TABLE IF NOT EXISTS templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS custom_field_defs (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          field_type TEXT NOT NULL,
          options TEXT,
          sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS custom_field_values (
          id TEXT PRIMARY KEY,
          post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          field_id TEXT NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
          value TEXT,
          UNIQUE(post_id, field_id)
        );
        CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(scheduled_date);
        CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
        CREATE INDEX IF NOT EXISTS idx_posts_sync ON posts(sync_source);
        CREATE INDEX IF NOT EXISTS idx_post_platforms_post ON post_platforms(post_id);
      `)
    }
  },
  {
    // Rebuilds search on post ids (rowids of TEXT key tables change on VACUUM), makes content_html
    // authoritative and stores sync sources relative to the sync folder so projects survive a move.
    version: 2,
    up: (db) => {
      db.exec(`
        DROP TRIGGER IF EXISTS posts_ai;
        DROP TRIGGER IF EXISTS posts_ad;
        DROP TRIGGER IF EXISTS posts_au;
        DROP TABLE IF EXISTS posts_fts;
      `)
      for (const row of db.all<LegacyPostRow>('SELECT id, content, content_html, sync_source FROM posts')) {
        const html = legacyContentToHtml(row)
        const syncSource = row.sync_source ? toRelativeSyncSource(row.sync_source) : null
        db.run('UPDATE posts SET content_html = ?, content = ?, sync_source = ? WHERE id = ?', [
          html,
          htmlToPlainText(html),
          syncSource,
          row.id
        ])
      }
      db.exec(SEARCH_INDEX_SQL)
      db.exec('CREATE INDEX IF NOT EXISTS idx_post_platforms_platform ON post_platforms(platform_id)')
    }
  }
]

export const GLOBAL_SCHEMA_VERSION = GLOBAL_MIGRATIONS[GLOBAL_MIGRATIONS.length - 1].version
export const PROJECT_SCHEMA_VERSION = PROJECT_MIGRATIONS[PROJECT_MIGRATIONS.length - 1].version

export function migrateGlobalDb(db: Db): void {
  migrate(db, '全域', GLOBAL_MIGRATIONS)
}

export function migrateProjectDb(db: Db): void {
  migrate(db, '專案', PROJECT_MIGRATIONS)
}
