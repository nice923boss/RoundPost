import { z } from 'zod'
import { handle } from './handle.ts'
import { Id, TemplateChanges, TemplateInput } from './schemas.ts'
import {
  createTemplate,
  deleteTemplate,
  getAllTemplates,
  updateTemplate
} from '../db/repositories/templateRepository.ts'

// Filling in placeholders happens in the renderer with shared/template.ts.
export function registerTemplateHandlers(): void {
  handle('templates:getAll', z.tuple([]), () => getAllTemplates())

  handle('templates:create', z.tuple([TemplateInput]), ([input]) => createTemplate(input))

  handle('templates:update', z.tuple([Id, TemplateChanges]), ([id, changes]) => {
    const updated = updateTemplate(id, changes)
    if (!updated) throw new Error('找不到範本')
    return updated
  })

  handle('templates:delete', z.tuple([Id]), ([id]) => deleteTemplate(id))
}
