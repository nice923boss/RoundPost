// The API the preload script exposes as window.electronAPI. Types only, so the renderer needs no electron types.
import type {
  AppInfo,
  ColumnMapping,
  CreatePostInput,
  ImportPreview,
  ImportResult,
  Platform,
  PlatformInput,
  PostFilters,
  PostWithPlatforms,
  Project,
  SyncEvent,
  SyncStatus,
  Template,
  TemplateInput,
  Theme,
  UpdatePostInput
} from './types.ts'

export interface ImportSelection {
  file: string
  preview: ImportPreview
}

export interface ClearPostsResult {
  deleted: number
  /** The project afterwards; syncing is off when it was on. */
  project: Project
}

export interface ElectronAPI {
  getPosts(filters?: PostFilters): Promise<PostWithPlatforms[]>
  getPost(id: string): Promise<PostWithPlatforms | null>
  createPost(input: CreatePostInput): Promise<PostWithPlatforms>
  updatePost(id: string, changes: UpdatePostInput): Promise<PostWithPlatforms>
  deletePost(id: string): Promise<boolean>
  searchPosts(query: string, filters?: PostFilters): Promise<PostWithPlatforms[]>
  /** Deletes every post of the given project, which must be the open one, and turns its syncing off. */
  clearAllPosts(projectId: string): Promise<ClearPostsResult>
  /** Marks the confirmed posts of the day as published and returns how many there were. */
  markPublishedByDate(date: string): Promise<number>

  togglePublished(postPlatformId: string): Promise<PostWithPlatforms>
  addPlatformToPost(postId: string, platformId: string): Promise<PostWithPlatforms>
  removePlatformFromPost(postId: string, platformId: string): Promise<PostWithPlatforms>

  getPlatforms(): Promise<Platform[]>
  createPlatform(input: PlatformInput): Promise<Platform>
  updatePlatform(id: string, changes: Partial<PlatformInput>): Promise<Platform>
  deletePlatform(id: string): Promise<boolean>

  /** Puts the post on the clipboard as HTML, RTF and plain text. */
  copyPost(postId: string): Promise<void>
  openPlatformUrl(platformId: string): Promise<void>

  getProjects(): Promise<Project[]>
  getActiveProject(): Promise<Project | null>
  /** Creates the project and opens it. */
  createProject(name: string): Promise<Project>
  switchProject(id: string): Promise<Project>
  /** Returns the project that is open afterwards. */
  deleteProject(id: string): Promise<Project | null>

  /** Null when the dialog is cancelled. */
  chooseSyncFolder(): Promise<Project | null>
  clearSyncFolder(): Promise<Project>
  getSyncStatus(): Promise<SyncStatus>
  /** Returns a function that stops listening. */
  onSyncEvent(callback: (event: SyncEvent) => void): () => void

  /** Null when the dialog is cancelled. */
  chooseImportFile(): Promise<ImportSelection | null>
  /** Imports the file chosen last. */
  runImport(mapping: ColumnMapping): Promise<ImportResult>
  /** Saves the import template where the user chooses; null when the dialog is cancelled. */
  saveImportTemplate(): Promise<string | null>

  getTemplates(): Promise<Template[]>
  createTemplate(input: TemplateInput): Promise<Template>
  updateTemplate(id: string, changes: Partial<TemplateInput>): Promise<Template>
  deleteTemplate(id: string): Promise<boolean>

  getTheme(): Promise<Theme>
  setTheme(theme: Theme): Promise<void>
  getAppInfo(): Promise<AppInfo>
  openLogFolder(): Promise<void>
  /** Writes a renderer error to the main log file. */
  logError(message: string, detail?: string): Promise<void>
  /** Before the window closes, the main process asks the page to save open edits; flush resolves false when saving failed. */
  onFlushRequest(flush: () => Promise<boolean>): () => void
}
