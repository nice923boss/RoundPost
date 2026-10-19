// Types shared by the main process, the preload bridge and the renderer.
// This file must stay free of imports so every side can load it.

export const POST_STATUSES = ['draft', 'confirmed', 'published'] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: '草稿',
  confirmed: '已確認',
  published: '已發佈'
}

export interface Post {
  id: string
  title: string
  /** Plain text derived from content_html; used for search and plain-text copies. */
  content: string
  /** Authoritative rich content (HTML produced by the editor or converted from Markdown). */
  content_html: string
  /** Local calendar date, YYYY-MM-DD. */
  scheduled_date: string | null
  /** Local time, HH:mm. */
  scheduled_time: string | null
  status: PostStatus
  template_id: string | null
  /** Path relative to the project's sync folder, e.g. "sync/post.md". */
  sync_source: string | null
  sync_hash: string | null
  source_skill: string | null
  created_at: string
  updated_at: string
}

export interface PostPlatform {
  id: string
  post_id: string
  platform_id: string
  platform_name: string
  published: boolean
  published_at: string | null
}

export interface PostWithPlatforms extends Post {
  platforms: PostPlatform[]
}

export interface Platform {
  id: string
  name: string
  url: string
  notes: string
  sort_order: number
  icon: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  db_path: string
  description: string
  sync_folder: string
  created_at: string
  updated_at: string
}

export interface Template {
  id: string
  name: string
  content: string
  created_at: string
  updated_at: string
}

export interface CreatePostInput {
  title: string
  content_html?: string
  scheduled_date?: string | null
  scheduled_time?: string | null
  status?: PostStatus
  platform_ids?: string[]
}

/** Fields the renderer may change; everything else is managed by the main process. */
export interface UpdatePostInput {
  title?: string
  content_html?: string
  scheduled_date?: string | null
  scheduled_time?: string | null
  status?: PostStatus
}

export interface PostFilters {
  date_from?: string
  date_to?: string
  status?: PostStatus
  platform_id?: string
}

export interface PlatformInput {
  name: string
  url?: string
  notes?: string
  icon?: string
}

export interface TemplateInput {
  name: string
  content: string
}

/** Maps post fields to column headers of the imported sheet. */
export interface ColumnMapping {
  title: string
  content?: string
  date?: string
  time?: string
  platforms?: string
  status?: string
}

export interface ImportPreview {
  headers: string[]
  sampleRows: Record<string, string>[]
  totalRows: number
  /** Best guess based on common Chinese and English header names. */
  suggestedMapping: Partial<ColumnMapping>
}

export interface ImportRowError {
  /** 1-based row number as shown in a spreadsheet (header row is 1). */
  row: number
  message: string
}

export interface ImportResult {
  imported: number
  /** Rows whose title and date match a post that already exists */
  skipped: number
  errors: ImportRowError[]
  /** Platform names in the file that are not in the platform list */
  unknownPlatforms: string[]
}

export type SyncAction = 'created' | 'updated' | 'skipped' | 'removed' | 'error'

export interface SyncEvent {
  file: string
  action: SyncAction
  message?: string
  at: string
}

export interface SyncStatus {
  folder: string
  watching: boolean
  lastEvent: SyncEvent | null
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export interface AppInfo {
  version: string
  userDataDir: string
  logDir: string
}
