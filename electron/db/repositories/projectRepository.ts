import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  closeProjectDb,
  getDataDir,
  getGlobalDb,
  getOpenProjectId,
  openProjectDb,
  resolveProjectDbPath
} from '../connection.ts'
import { getSetting, setSetting } from './settingsRepository.ts'
import type { Project } from '../../../shared/types.ts'

const LAST_ACTIVE_KEY = 'last_active_project'
const DEFAULT_PROJECT_NAME = '預設專案'
// The database file, its SQLite side files and the copies kept before schema upgrades.
const PROJECT_FILE_SUFFIX = /^(|-wal|-shm|-journal|\.v\d+\.bak)$/

export function getAllProjects(): Project[] {
  return getGlobalDb().all<Project>('SELECT * FROM projects ORDER BY created_at')
}

export function getProjectById(id: string): Project | undefined {
  return getGlobalDb().get<Project>('SELECT * FROM projects WHERE id = ?', [id])
}

function requireProject(id: string): Project {
  const project = getProjectById(id)
  if (!project) throw new Error('找不到專案')
  return project
}

export function getActiveProject(): Project | undefined {
  const id = getOpenProjectId()
  return id ? getProjectById(id) : undefined
}

export function createProject(name: string): Project {
  const now = new Date().toISOString()
  const id = randomUUID()
  const project: Project = {
    id,
    name: name.trim(),
    db_path: path.join(getDataDir(), `project-${id}.db`),
    description: '',
    sync_folder: '',
    created_at: now,
    updated_at: now
  }
  getGlobalDb().run(
    `INSERT INTO projects (id, name, db_path, description, sync_folder, created_at, updated_at)
     VALUES (@id, @name, @db_path, @description, @sync_folder, @created_at, @updated_at)`,
    { ...project }
  )
  return project
}

/** Opens the project's database and remembers the project for the next start. */
export function switchToProject(id: string): Project {
  const project = requireProject(id)
  const dbPath = resolveProjectDbPath(project.db_path)
  openProjectDb(dbPath, id)
  if (dbPath !== project.db_path) getGlobalDb().run('UPDATE projects SET db_path = ? WHERE id = ?', [dbPath, id])
  setSetting(LAST_ACTIVE_KEY, id)
  return { ...project, db_path: dbPath }
}

/** Opens the last used project, else the oldest one, else a new empty project. */
export function openInitialProject(): Project {
  const projects = getAllProjects()
  const lastId = getSetting(LAST_ACTIVE_KEY)
  const target = projects.find((p) => p.id === lastId) ?? projects[0] ?? createProject(DEFAULT_PROJECT_NAME)
  return switchToProject(target.id)
}

export function setProjectSyncFolder(id: string, folder: string): Project {
  requireProject(id)
  getGlobalDb().run('UPDATE projects SET sync_folder = ?, updated_at = ? WHERE id = ?', [
    folder,
    new Date().toISOString(),
    id
  ])
  return requireProject(id)
}

function projectFiles(dbPath: string): string[] {
  const dir = path.dirname(dbPath)
  const base = path.basename(dbPath)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(base) && PROJECT_FILE_SUFFIX.test(name.slice(base.length)))
    .map((name) => path.join(dir, name))
}

/** Removes the project from the list and returns its files that still exist, for the caller to move to the trash. */
export function deleteProject(id: string): string[] {
  const project = requireProject(id)
  if (getOpenProjectId() === id) closeProjectDb()
  getGlobalDb().run('DELETE FROM projects WHERE id = ?', [id])
  return projectFiles(resolveProjectDbPath(project.db_path))
}
