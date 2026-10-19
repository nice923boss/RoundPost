import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Db } from '../electron/db/db.ts'
import { closeAllDbs, getGlobalDb, getProjectDb, initGlobalDb, openProjectDb } from '../electron/db/connection.ts'
import { toRelativeSyncSource } from '../electron/db/schema.ts'
import { searchPosts } from '../electron/db/repositories/postRepository.ts'
import { makeTempDir, removeTempDir } from './helpers.ts'

const NOW = '2026-01-01T00:00:00.000Z'

function withTempDir(run: (dir: string) => void): void {
  const dir = makeTempDir()
  try {
    run(dir)
  } finally {
    closeAllDbs()
    removeTempDir(dir)
  }
}

/** Rewrites a fresh project database into the version 1 layout, with the content formats version 1 stored. */
function downgradeProjectToV1(file: string): void {
  const db = new Db(file)
  db.exec(`
    DROP TRIGGER posts_fts_ai;
    DROP TRIGGER posts_fts_ad;
    DROP TRIGGER posts_fts_au;
    DROP TABLE posts_fts;
    DROP INDEX idx_post_platforms_platform;
    CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN SELECT 1; END;
    UPDATE _schema_version SET version = 1;
  `)
  const rows = [
    { id: 'html', content: '<p>舊的<strong>HTML</strong>內容</p>', content_html: '', sync_source: null },
    { id: 'md', content: '**同步**的貼文\n第二行', content_html: '', sync_source: 'C:\\Users\\Clare\\RoundPost\\sync\\2026\\a.md' },
    { id: 'plain', content: '純文字\n第二行', content_html: null, sync_source: null },
    { id: 'empty', content: '', content_html: '<p>只有 HTML<script>x</script></p>', sync_source: null }
  ]
  for (const row of rows) {
    db.run(
      `INSERT INTO posts (id, title, content, content_html, sync_source, created_at, updated_at)
       VALUES (@id, @id, @content, @content_html, @sync_source, @now, @now)`,
      { ...row, now: NOW }
    )
  }
  db.close()
}

test('toRelativeSyncSource keeps the part from the sync folder on', () => {
  assert.equal(toRelativeSyncSource('C:\\x\\sync\\a.md'), 'sync/a.md')
  assert.equal(toRelativeSyncSource('C:\\x\\SYNC\\2026\\a.md'), 'sync/2026/a.md')
  assert.equal(toRelativeSyncSource('sync/b.md'), 'sync/b.md')
  assert.equal(toRelativeSyncSource('D:/other/c.md'), 'sync/c.md')
})

test('a version 1 project database is upgraded to version 2 with a backup', () => {
  withTempDir((dir) => {
    initGlobalDb(dir)
    const file = path.join(dir, 'project-old.db')
    openProjectDb(file, 'old')
    closeAllDbs()
    downgradeProjectToV1(file)

    initGlobalDb(dir)
    const db = openProjectDb(file, 'old')
    assert.ok(fs.existsSync(`${file}.v1.bak`))
    assert.equal(db.get<{ version: number }>('SELECT version FROM _schema_version')?.version, 2)
    assert.equal(db.get<{ c: number }>("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'posts_ai'")?.c, 0)

    const post = (id: string) =>
      db.get<{ content: string; content_html: string; sync_source: string | null }>(
        'SELECT content, content_html, sync_source FROM posts WHERE id = ?',
        [id]
      )
    assert.deepEqual(post('html'), { content: '舊的HTML內容', content_html: '<p>舊的<strong>HTML</strong>內容</p>', sync_source: null })
    assert.match(post('md')?.content_html ?? '', /<strong>同步<\/strong>的貼文<br>/)
    assert.equal(post('md')?.content, '同步的貼文\n第二行')
    assert.equal(post('md')?.sync_source, 'sync/2026/a.md')
    assert.deepEqual(post('plain'), { content: '純文字\n第二行', content_html: '<p>純文字<br>第二行</p>', sync_source: null })
    assert.equal(post('empty')?.content_html, '<p>只有 HTML</p>')

    assert.deepEqual(
      searchPosts('同步的').map((p) => p.id),
      ['md']
    )
    assert.equal(getProjectDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM posts_fts')?.c, 4)
  })
})

/** Rewrites a fresh global database into the version 1 layout with the old sync folder setting. */
function downgradeGlobalToV1(file: string, settings: Record<string, string>): void {
  const db = new Db(file)
  db.run(`INSERT INTO projects (id, name, db_path, created_at, updated_at) VALUES ('p1', '先建的', 'p1.db', '2026-01-01', '2026-01-01')`)
  db.run(`INSERT INTO projects (id, name, db_path, created_at, updated_at) VALUES ('p2', '後建的', 'p2.db', '2026-02-01', '2026-02-01')`)
  db.exec('ALTER TABLE projects DROP COLUMN sync_folder; UPDATE _schema_version SET version = 1;')
  for (const [key, value] of Object.entries(settings)) db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
  db.close()
}

function syncFolders(): Record<string, string> {
  const rows = getGlobalDb().all<{ id: string; sync_folder: string }>('SELECT id, sync_folder FROM projects ORDER BY id')
  return Object.fromEntries(rows.map((r) => [r.id, r.sync_folder]))
}

test('the global sync folder setting moves to the last active project', () => {
  withTempDir((dir) => {
    initGlobalDb(dir)
    closeAllDbs()
    downgradeGlobalToV1(path.join(dir, 'roundpost-global.db'), { sync_folder_path: 'D:\\同步', last_active_project: 'p2' })

    initGlobalDb(dir)
    assert.deepEqual(syncFolders(), { p1: '', p2: 'D:\\同步' })
    assert.equal(getGlobalDb().get("SELECT value FROM settings WHERE key = 'sync_folder_path'"), undefined)
    assert.ok(fs.existsSync(path.join(dir, 'roundpost-global.db.v1.bak')))
  })
})

test('without a last active project the sync folder goes to the oldest project', () => {
  withTempDir((dir) => {
    initGlobalDb(dir)
    closeAllDbs()
    downgradeGlobalToV1(path.join(dir, 'roundpost-global.db'), { sync_folder_path: 'D:\\同步' })

    initGlobalDb(dir)
    assert.deepEqual(syncFolders(), { p1: 'D:\\同步', p2: '' })
  })
})
