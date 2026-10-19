// Shared setup for tests that need databases: a temporary data folder with the global and one project database.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before } from 'node:test'
import { closeAllDbs, initGlobalDb, openProjectDb } from '../electron/db/connection.ts'

export const TEST_PROJECT_ID = 'test-project'

export function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roundpost-test-'))
}

export function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Opens fresh databases before the file's tests and removes them afterwards. Returns a getter for the folder. */
export function useTempDatabases(): () => string {
  let dir = ''
  before(() => {
    dir = makeTempDir()
    initGlobalDb(dir)
    openProjectDb(path.join(dir, `project-${TEST_PROJECT_ID}.db`), TEST_PROJECT_ID)
  })
  after(() => {
    closeAllDbs()
    removeTempDir(dir)
  })
  return () => dir
}
