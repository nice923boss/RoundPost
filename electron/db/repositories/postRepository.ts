import { randomUUID } from 'node:crypto'
import { getProjectDb } from '../connection.ts'
import { htmlToPlainText, sanitizeHtml } from '../../services/html.ts'
import { ensurePlatform, getAllPlatforms, getPlatformById } from './platformRepository.ts'
import type {
  CreatePostInput,
  Platform,
  Post,
  PostFilters,
  PostPlatform,
  PostWithPlatforms,
  UpdatePostInput
} from '../../../shared/types.ts'

interface PostPlatformRow extends Omit<PostPlatform, 'published'> {
  published: number
}

export interface SyncPostInput {
  /** Path inside the sync folder, for example "sync/post.md" */
  sync_source: string
  /** Hash of the sync file itself, so any change to the file is picked up */
  sync_hash: string
  source_skill: string | null
  title: string
  content_html: string
  scheduled_date: string | null
  scheduled_time: string | null
  /** Status written in the file; only "confirmed" is taken over */
  file_status: string | null
  platform_names: string[]
}

export type SyncUpsertAction = 'created' | 'updated' | 'skipped'

export interface SyncUpsertResult {
  post: PostWithPlatforms
  action: SyncUpsertAction
}

// Dated posts first, by date and time; undated posts last.
const ORDER_BY_SCHEDULE =
  'ORDER BY p.scheduled_date IS NULL, p.scheduled_date, p.scheduled_time IS NULL, p.scheduled_time, p.created_at'

// The trigram tokenizer cannot match words shorter than three characters.
const MIN_INDEXED_TERM = 3

function whereSql(conditions: string[]): string {
  return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
}

function filterSql(filters: PostFilters | undefined): { where: string[]; params: Record<string, string> } {
  const where: string[] = []
  const params: Record<string, string> = {}
  if (filters?.date_from) {
    where.push('p.scheduled_date >= @date_from')
    params.date_from = filters.date_from
  }
  if (filters?.date_to) {
    where.push('p.scheduled_date <= @date_to')
    params.date_to = filters.date_to
  }
  if (filters?.status) {
    where.push('p.status = @status')
    params.status = filters.status
  }
  if (filters?.platform_id) {
    where.push('EXISTS (SELECT 1 FROM post_platforms pp WHERE pp.post_id = p.id AND pp.platform_id = @platform_id)')
    params.platform_id = filters.platform_id
  }
  return { where, params }
}

/** Loads the platforms of many posts in one query and orders them like the platform list. */
function attachPlatforms(posts: Post[]): PostWithPlatforms[] {
  if (posts.length === 0) return []
  const rows = getProjectDb().all<PostPlatformRow>(
    'SELECT * FROM post_platforms WHERE post_id IN (SELECT value FROM json_each(?))',
    [JSON.stringify(posts.map((p) => p.id))]
  )
  const known = new Map(getAllPlatforms().map((platform, index) => [platform.id, { platform, index }]))
  const rank = (pp: PostPlatform): number => known.get(pp.platform_id)?.index ?? Number.MAX_SAFE_INTEGER
  const byPost = new Map<string, PostPlatform[]>()
  for (const row of rows) {
    // Show the current name; platforms deleted from the list keep the name stored with the post.
    const current = known.get(row.platform_id)?.platform
    const item: PostPlatform = { ...row, platform_name: current?.name ?? row.platform_name, published: Boolean(row.published) }
    byPost.set(row.post_id, [...(byPost.get(row.post_id) ?? []), item])
  }
  return posts.map((post) => ({
    ...post,
    platforms: (byPost.get(post.id) ?? []).sort(
      (a, b) => rank(a) - rank(b) || a.platform_name.localeCompare(b.platform_name)
    )
  }))
}

function requirePostRow(id: string): Post {
  const post = getProjectDb().get<Post>('SELECT * FROM posts WHERE id = ?', [id])
  if (!post) throw new Error('找不到貼文')
  return post
}

function requirePost(id: string): PostWithPlatforms {
  return attachPlatforms([requirePostRow(id)])[0]
}

function requirePlatform(id: string): Platform {
  const platform = getPlatformById(id)
  if (!platform) throw new Error('找不到平台')
  return platform
}

function insertPost(post: Post): void {
  getProjectDb().run(
    `INSERT INTO posts (id, title, content, content_html, scheduled_date, scheduled_time, status, template_id,
       sync_source, sync_hash, source_skill, created_at, updated_at)
     VALUES (@id, @title, @content, @content_html, @scheduled_date, @scheduled_time, @status, @template_id,
       @sync_source, @sync_hash, @source_skill, @created_at, @updated_at)`,
    { ...post }
  )
}

function insertPostPlatform(postId: string, platform: Platform): void {
  getProjectDb().run(
    'INSERT OR IGNORE INTO post_platforms (id, post_id, platform_id, platform_name, published) VALUES (?, ?, ?, ?, 0)',
    [randomUUID(), postId, platform.id, platform.name]
  )
}

export function getAllPosts(filters?: PostFilters): PostWithPlatforms[] {
  const { where, params } = filterSql(filters)
  return attachPlatforms(getProjectDb().all<Post>(`SELECT p.* FROM posts p${whereSql(where)} ${ORDER_BY_SCHEDULE}`, params))
}

export function getPostById(id: string): PostWithPlatforms | undefined {
  const post = getProjectDb().get<Post>('SELECT * FROM posts WHERE id = ?', [id])
  return post ? attachPlatforms([post])[0] : undefined
}

/** Used by imports to skip rows that were imported before. */
export function postExists(title: string, scheduledDate: string | null): boolean {
  return getProjectDb().get('SELECT 1 AS found FROM posts WHERE title = ? AND scheduled_date IS ?', [title, scheduledDate]) !== undefined
}

export function createPost(input: CreatePostInput): PostWithPlatforms {
  const platforms = [...new Set(input.platform_ids ?? [])].map(requirePlatform)
  const now = new Date().toISOString()
  const html = sanitizeHtml(input.content_html ?? '')
  const post: Post = {
    id: randomUUID(),
    title: input.title.trim(),
    content: htmlToPlainText(html),
    content_html: html,
    scheduled_date: input.scheduled_date ?? null,
    scheduled_time: input.scheduled_time ?? null,
    status: input.status ?? 'draft',
    template_id: null,
    sync_source: null,
    sync_hash: null,
    source_skill: null,
    created_at: now,
    updated_at: now
  }
  getProjectDb().transaction(() => {
    insertPost(post)
    for (const platform of platforms) insertPostPlatform(post.id, platform)
  })
  return requirePost(post.id)
}

/** Fields left undefined keep their value; null clears the date or time. */
export function updatePost(id: string, changes: UpdatePostInput): PostWithPlatforms {
  const existing = requirePostRow(id)
  const html = changes.content_html === undefined ? existing.content_html : sanitizeHtml(changes.content_html)
  const updated: Post = {
    ...existing,
    title: changes.title?.trim() ?? existing.title,
    content_html: html,
    content: changes.content_html === undefined ? existing.content : htmlToPlainText(html),
    scheduled_date: changes.scheduled_date === undefined ? existing.scheduled_date : changes.scheduled_date,
    scheduled_time: changes.scheduled_time === undefined ? existing.scheduled_time : changes.scheduled_time,
    status: changes.status ?? existing.status,
    updated_at: new Date().toISOString()
  }
  getProjectDb().run(
    `UPDATE posts SET title = @title, content = @content, content_html = @content_html, scheduled_date = @scheduled_date,
       scheduled_time = @scheduled_time, status = @status, updated_at = @updated_at
     WHERE id = @id`,
    {
      id,
      title: updated.title,
      content: updated.content,
      content_html: updated.content_html,
      scheduled_date: updated.scheduled_date,
      scheduled_time: updated.scheduled_time,
      status: updated.status,
      updated_at: updated.updated_at
    }
  )
  return requirePost(id)
}

/** Platform rows and custom field values go with the post through ON DELETE CASCADE. */
export function deletePost(id: string): boolean {
  return getProjectDb().run('DELETE FROM posts WHERE id = ?', [id]).changes > 0
}

/** Marks the confirmed posts of a day and all their platforms as published. Returns the number of posts. */
export function markPublishedByDate(date: string): number {
  const db = getProjectDb()
  return db.transaction(() => {
    const ids = db
      .all<{ id: string }>("SELECT id FROM posts WHERE scheduled_date = ? AND status = 'confirmed'", [date])
      .map((row) => row.id)
    if (ids.length === 0) return 0
    const now = new Date().toISOString()
    const list = JSON.stringify(ids)
    db.run("UPDATE posts SET status = 'published', updated_at = ? WHERE id IN (SELECT value FROM json_each(?))", [now, list])
    db.run(
      'UPDATE post_platforms SET published = 1, published_at = COALESCE(published_at, ?) WHERE post_id IN (SELECT value FROM json_each(?))',
      [now, list]
    )
    return ids.length
  })
}

export function togglePostPlatformPublished(postPlatformId: string): PostWithPlatforms {
  const db = getProjectDb()
  const row = db.get<PostPlatformRow>('SELECT * FROM post_platforms WHERE id = ?', [postPlatformId])
  if (!row) throw new Error('找不到貼文平台')
  const published = !row.published
  db.run('UPDATE post_platforms SET published = ?, published_at = ? WHERE id = ?', [
    published,
    published ? new Date().toISOString() : null,
    postPlatformId
  ])
  return requirePost(row.post_id)
}

export function addPlatformToPost(postId: string, platformId: string): PostWithPlatforms {
  requirePostRow(postId)
  insertPostPlatform(postId, requirePlatform(platformId))
  return requirePost(postId)
}

export function removePlatformFromPost(postId: string, platformId: string): PostWithPlatforms {
  getProjectDb().run('DELETE FROM post_platforms WHERE post_id = ? AND platform_id = ?', [postId, platformId])
  return requirePost(postId)
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function ftsPhrase(term: string): string {
  return `"${term.replaceAll('"', '""')}"`
}

/** Every word must appear in the title or the text. Longer words use the full text index, ranked by relevance. */
export function searchPosts(query: string, filters?: PostFilters): PostWithPlatforms[] {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  const indexed = terms.filter((t) => [...t].length >= MIN_INDEXED_TERM)
  const short = terms.filter((t) => [...t].length < MIN_INDEXED_TERM)
  const { where, params } = filterSql(filters)
  short.forEach((term, i) => {
    where.push(`(p.title LIKE @like${i} ESCAPE '\\' OR p.content LIKE @like${i} ESCAPE '\\')`)
    params[`like${i}`] = `%${escapeLike(term)}%`
  })
  const db = getProjectDb()
  if (indexed.length === 0) {
    return attachPlatforms(db.all<Post>(`SELECT p.* FROM posts p${whereSql(where)} ORDER BY p.updated_at DESC`, params))
  }
  params.match = indexed.map(ftsPhrase).join(' ')
  const sql = `SELECT p.* FROM posts_fts JOIN posts p ON p.id = posts_fts.post_id
    WHERE posts_fts MATCH @match${where.map((w) => ` AND ${w}`).join('')}
    ORDER BY posts_fts.rank`
  return attachPlatforms(db.all<Post>(sql, params))
}

export function findPostBySyncSource(source: string): Post | undefined {
  return getProjectDb().get<Post>('SELECT * FROM posts WHERE sync_source = ?', [source])
}

/** Makes the post's platforms match the file. Platforms already marked published stay, so that record is kept. */
function syncPostPlatforms(postId: string, names: string[]): void {
  const wanted = new Map<string, Platform>()
  for (const name of names) {
    if (!name.trim()) continue
    const platform = ensurePlatform(name)
    wanted.set(platform.id, platform)
  }
  getProjectDb().run(
    'DELETE FROM post_platforms WHERE post_id = ? AND published = 0 AND platform_id NOT IN (SELECT value FROM json_each(?))',
    [postId, JSON.stringify([...wanted.keys()])]
  )
  for (const platform of wanted.values()) insertPostPlatform(postId, platform)
}

/**
 * Creates or refreshes the post that belongs to a sync file. An unchanged file is skipped.
 * The file decides title, text, date, time and platforms; the status only ever moves from draft to confirmed.
 */
export function upsertSyncedPost(input: SyncPostInput): SyncUpsertResult {
  const db = getProjectDb()
  return db.transaction((): SyncUpsertResult => {
    const existing = findPostBySyncSource(input.sync_source)
    if (existing && existing.sync_hash === input.sync_hash) return { post: requirePost(existing.id), action: 'skipped' }
    const now = new Date().toISOString()
    const html = sanitizeHtml(input.content_html)
    const fields = {
      title: input.title.trim(),
      content: htmlToPlainText(html),
      content_html: html,
      scheduled_date: input.scheduled_date,
      scheduled_time: input.scheduled_time,
      sync_hash: input.sync_hash,
      source_skill: input.source_skill,
      updated_at: now
    }
    const fileConfirmed = input.file_status === 'confirmed'
    if (existing) {
      const status = existing.status === 'draft' && fileConfirmed ? 'confirmed' : existing.status
      db.run(
        `UPDATE posts SET title = @title, content = @content, content_html = @content_html, scheduled_date = @scheduled_date,
           scheduled_time = @scheduled_time, status = @status, sync_hash = @sync_hash, source_skill = @source_skill,
           updated_at = @updated_at
         WHERE id = @id`,
        { ...fields, status, id: existing.id }
      )
      syncPostPlatforms(existing.id, input.platform_names)
      return { post: requirePost(existing.id), action: 'updated' }
    }
    const post: Post = {
      ...fields,
      id: randomUUID(),
      status: fileConfirmed ? 'confirmed' : 'draft',
      template_id: null,
      sync_source: input.sync_source,
      created_at: now
    }
    insertPost(post)
    syncPostPlatforms(post.id, input.platform_names)
    return { post: requirePost(post.id), action: 'created' }
  })
}
