import { z } from 'zod'
import { handle } from './handle.ts'
import { Id, PlatformChanges, PlatformInput } from './schemas.ts'
import {
  createPlatform,
  deletePlatform,
  getAllPlatforms,
  updatePlatform
} from '../db/repositories/platformRepository.ts'

export function registerPlatformHandlers(): void {
  handle('platforms:getAll', z.tuple([]), () => getAllPlatforms())

  handle('platforms:create', z.tuple([PlatformInput]), ([input]) => createPlatform(input))

  handle('platforms:update', z.tuple([Id, PlatformChanges]), ([id, changes]) => {
    const updated = updatePlatform(id, changes)
    if (!updated) throw new Error('找不到平台')
    return updated
  })

  handle('platforms:delete', z.tuple([Id]), ([id]) => deletePlatform(id))
}
