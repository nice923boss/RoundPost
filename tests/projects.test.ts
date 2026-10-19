import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { closeAllDbs, getGlobalDb, getOpenProjectId, initGlobalDb } from '../electron/db/connection.ts'
import {
  createProject,
  deleteProject,
  getAllProjects,
  getProjectById,
  openInitialProject,
  setProjectSyncFolder,
  switchToProject
} from '../electron/db/repositories/projectRepository.ts'
import { makeTempDir, removeTempDir } from './helpers.ts'

let dir = ''
before(() => {
  dir = makeTempDir()
  initGlobalDb(dir)
})
after(() => {
  closeAllDbs()
  removeTempDir(dir)
})

test('the first start creates and opens a default project', () => {
  const project = openInitialProject()
  assert.equal(project.name, '預設專案')
  assert.equal(project.db_path, path.join(dir, `project-${project.id}.db`))
  assert.equal(getOpenProjectId(), project.id)
  assert.ok(fs.existsSync(project.db_path))
})

test('the next start opens the project used last', () => {
  const second = createProject('  第二個專案  ')
  assert.equal(second.name, '第二個專案')
  switchToProject(second.id)
  assert.equal(getOpenProjectId(), second.id)

  initGlobalDb(dir)
  assert.equal(getOpenProjectId(), null)
  assert.equal(openInitialProject().id, second.id)
  assert.equal(getAllProjects().length, 2)
})

test('a database path stored on another computer falls back to the data folder', () => {
  const project = createProject('搬過來的')
  const foreign = `Z:\\Users\\Clare\\AppData\\Roaming\\roundpost\\project-${project.id}.db`
  getGlobalDb().run('UPDATE projects SET db_path = ? WHERE id = ?', [foreign, project.id])
  const opened = switchToProject(project.id)
  assert.equal(opened.db_path, path.join(dir, `project-${project.id}.db`))
  assert.equal(getProjectById(project.id)?.db_path, opened.db_path)
})

test('setProjectSyncFolder and unknown projects', () => {
  const [first] = getAllProjects()
  assert.equal(setProjectSyncFolder(first.id, 'D:\\同步').sync_folder, 'D:\\同步')
  assert.throws(() => switchToProject('missing'), /找不到專案/)
  assert.throws(() => deleteProject('missing'), /找不到專案/)
})

test('deleteProject closes the project and lists its files without deleting them', () => {
  const project = createProject('要刪的')
  switchToProject(project.id)
  fs.writeFileSync(`${project.db_path}.v1.bak`, '')
  fs.writeFileSync(`${project.db_path}.old`, '')

  const files = deleteProject(project.id)
  assert.equal(getOpenProjectId(), null)
  assert.equal(getProjectById(project.id), undefined)
  const names = files.map((file) => path.basename(file).slice(path.basename(project.db_path).length)).sort()
  assert.ok(names.includes(''))
  assert.ok(names.includes('.v1.bak'))
  assert.ok(!names.includes('.old'))
  assert.ok(names.every((suffix) => /^(|-wal|-shm|-journal|\.v\d+\.bak)$/.test(suffix)))
  assert.ok(files.every((file) => fs.existsSync(file)))
})
