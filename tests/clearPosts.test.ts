import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { closeAllDbs, getProjectDb, initGlobalDb } from '../electron/db/connection.ts'
import { getAllPlatforms } from '../electron/db/repositories/platformRepository.ts'
import { createPost, getAllPosts, searchPosts } from '../electron/db/repositories/postRepository.ts'
import { getActiveProject, setProjectSyncFolder } from '../electron/db/repositories/projectRepository.ts'
import { clearProjectPosts, openInitialProject } from '../electron/services/workspace.ts'
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

test('clearProjectPosts deletes every post of the open project and turns syncing off', async () => {
  const project = await openInitialProject()
  const platforms = getAllPlatforms()
  createPost({ title: '春季活動預告', scheduled_date: '2026-05-08', status: 'confirmed', platform_ids: [platforms[0].id] })
  createPost({ title: '未排程的草稿' })
  // Stored without starting a watcher; clearing must still turn it off.
  setProjectSyncFolder(project.id, path.join(dir, '發文準備師'))

  await assert.rejects(clearProjectPosts('another-project'), /目前開啟的專案已變更/)
  assert.equal(getAllPosts().length, 2, 'a stale project id deletes nothing')

  const result = await clearProjectPosts(project.id)
  assert.equal(result.deleted, 2)
  assert.equal(result.project.sync_folder, '')
  assert.equal(getActiveProject()?.sync_folder, '')
  assert.deepEqual(getAllPosts(), [])
  assert.equal(getProjectDb().get<{ n: number }>('SELECT COUNT(*) AS n FROM post_platforms')?.n, 0)
  assert.deepEqual(searchPosts('春季活動'), [], 'the search index is emptied too')
  assert.deepEqual(getAllPlatforms(), platforms, 'platforms are kept')

  const again = await clearProjectPosts(project.id)
  assert.equal(again.deleted, 0)
})
