import { randomUUID } from 'node:crypto'
import { getProjectDb } from '../connection.ts'
import type { Template, TemplateInput } from '../../../shared/types.ts'

export function getAllTemplates(): Template[] {
  return getProjectDb().all<Template>('SELECT * FROM templates ORDER BY name COLLATE NOCASE')
}

export function getTemplateById(id: string): Template | undefined {
  return getProjectDb().get<Template>('SELECT * FROM templates WHERE id = ?', [id])
}

export function createTemplate(input: TemplateInput): Template {
  const now = new Date().toISOString()
  const template: Template = {
    id: randomUUID(),
    name: input.name.trim(),
    content: input.content,
    created_at: now,
    updated_at: now
  }
  getProjectDb().run(
    'INSERT INTO templates (id, name, content, created_at, updated_at) VALUES (@id, @name, @content, @created_at, @updated_at)',
    { ...template }
  )
  return template
}

export function updateTemplate(id: string, changes: Partial<TemplateInput>): Template | undefined {
  const existing = getTemplateById(id)
  if (!existing) return undefined
  const updated: Template = {
    ...existing,
    name: changes.name?.trim() ?? existing.name,
    content: changes.content ?? existing.content,
    updated_at: new Date().toISOString()
  }
  getProjectDb().run('UPDATE templates SET name = @name, content = @content, updated_at = @updated_at WHERE id = @id', {
    id,
    name: updated.name,
    content: updated.content,
    updated_at: updated.updated_at
  })
  return updated
}

export function deleteTemplate(id: string): boolean {
  return getProjectDb().run('DELETE FROM templates WHERE id = ?', [id]).changes > 0
}
