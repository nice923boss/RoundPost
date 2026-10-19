import { shell } from 'electron'
import { z } from 'zod'
import { handle } from './handle.ts'
import { Id, ProjectName } from './schemas.ts'
import { createProject, getActiveProject, getAllProjects } from '../db/repositories/projectRepository.ts'
import { deleteProjectAndSwitch, openProject } from '../services/workspace.ts'
import { createLogger } from '../services/logger.ts'

const log = createLogger('projects')

export function registerProjectHandlers(): void {
  handle('projects:getAll', z.tuple([]), () => getAllProjects())

  handle('projects:getActive', z.tuple([]), () => getActiveProject() ?? null)

  handle('projects:create', z.tuple([ProjectName]), ([name]) => openProject(createProject(name).id))

  handle('projects:switch', z.tuple([Id]), ([id]) => openProject(id))

  // The database files go to the recycle bin; files in the sync folder are never touched.
  handle('projects:delete', z.tuple([Id]), async ([id]) => {
    const { files, active } = await deleteProjectAndSwitch(id)
    for (const file of files) {
      try {
        await shell.trashItem(file)
      } catch (err) {
        log.warn(`無法把 ${file} 移到資源回收筒`, err)
      }
    }
    return active
  })
}
