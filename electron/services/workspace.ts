// Keeps the open project and the sync folder watcher in step. Free of electron imports so it can be tested.
import { closeAllDbs, getOpenProjectId } from '../db/connection.ts'
import {
  deleteProject,
  getActiveProject,
  openInitialProject as openInitialProjectDb,
  setProjectSyncFolder,
  switchToProject
} from '../db/repositories/projectRepository.ts'
import { normalizeSyncFolder, startWatching, stopWatching } from './fileWatcherService.ts'
import type { Project, SyncEvent } from '../../shared/types.ts'

let broadcast: (event: SyncEvent) => void = () => {}

/** Where sync events go, normally to every open window. */
export function setSyncBroadcaster(fn: (event: SyncEvent) => void): void {
  broadcast = fn
}

async function watchProject(project: Project): Promise<Project> {
  if (project.sync_folder) await startWatching(project.sync_folder, (event) => broadcast(event))
  return project
}

export async function openProject(id: string): Promise<Project> {
  await stopWatching()
  return watchProject(switchToProject(id))
}

/** Opens the last used project at start-up. */
export async function openInitialProject(): Promise<Project> {
  await stopWatching()
  return watchProject(openInitialProjectDb())
}

/** An empty folder turns syncing off for the open project. */
export async function setSyncFolder(folder: string): Promise<Project> {
  const id = getOpenProjectId()
  if (!id) throw new Error('尚未開啟任何專案')
  await stopWatching()
  return watchProject(setProjectSyncFolder(id, folder ? normalizeSyncFolder(folder) : ''))
}

/**
 * Removes a project. When it was the open one, the next project is opened (a new empty one if none is left).
 * Returns the database files for the caller to move to the trash, and the project that is open afterwards.
 */
export async function deleteProjectAndSwitch(id: string): Promise<{ files: string[]; active: Project | null }> {
  const wasOpen = getOpenProjectId() === id
  if (wasOpen) await stopWatching()
  const files = deleteProject(id)
  const active = wasOpen ? await openInitialProject() : (getActiveProject() ?? null)
  return { files, active }
}

export async function closeWorkspace(): Promise<void> {
  try {
    await stopWatching()
  } finally {
    closeAllDbs()
  }
}
