import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseSyncFile, processSyncFile } from '../electron/services/syncFile.ts'
import { findPostBySyncSource, getPostById, togglePostPlatformPublished, updatePost } from '../electron/db/repositories/postRepository.ts'
import { useTempDatabases } from './helpers.ts'

const dataDir = useTempDatabases()

function frontmatter(fields: string, body = '內文'): string {
  return `---\n${fields}\n---\n${body}\n`
}

test('parseSyncFile reads the fields the post preparer writes', () => {
  const parsed = parseSyncFile(
    frontmatter(
      'title: 春季活動\ndate: 2026/5/8\ntime: 9:00\nplatforms: Facebook、Instagram，Facebook\nstatus: Confirmed\nsource_skill: post-preparer',
      '**重點**說明\n第二行'
    )
  )
  assert.equal(parsed.title, '春季活動')
  assert.equal(parsed.scheduled_date, '2026-05-08')
  assert.equal(parsed.scheduled_time, '09:00')
  assert.deepEqual(parsed.platform_names, ['Facebook', 'Instagram'])
  assert.equal(parsed.file_status, 'confirmed')
  assert.equal(parsed.source_skill, 'post-preparer')
  assert.match(parsed.content_html, /<strong>重點<\/strong>說明<br>/)
  assert.deepEqual(parsed.warnings, [])
})

test('parseSyncFile keeps YAML dates and times as text and accepts lists, BOM, CRLF and ... endings', () => {
  const parsed = parseSyncFile('﻿---\r\ntitle: "  有 BOM  "\r\ndate: 2026-05-08\r\ntime: 21:30:00\r\nplatforms: [Threads, LINE]\r\n...\r\n內文')
  assert.equal(parsed.title, '有 BOM')
  assert.equal(parsed.scheduled_date, '2026-05-08')
  assert.equal(parsed.scheduled_time, '21:30')
  assert.deepEqual(parsed.platform_names, ['Threads', 'LINE'])
  assert.equal(parsed.file_status, null)
  assert.equal(parsed.source_skill, null)
})

test('parseSyncFile turns unreadable dates and times into warnings', () => {
  const parsed = parseSyncFile(frontmatter('title: x\ndate: 2026-02-30\ntime: 25:00'))
  assert.equal(parsed.scheduled_date, null)
  assert.equal(parsed.scheduled_time, null)
  assert.deepEqual(parsed.warnings, ['日期「2026-02-30」無法辨識，已設為未排程', '時間「25:00」無法辨識，已清除'])
})

test('parseSyncFile rejects files it cannot use', () => {
  assert.throws(() => parseSyncFile('title: x\n內文'), /缺少 frontmatter/)
  assert.throws(() => parseSyncFile('---\ntitle: x\n內文'), /缺少結尾/)
  assert.throws(() => parseSyncFile(frontmatter('date: 2026-05-08')), /缺少標題/)
  assert.throws(() => parseSyncFile(frontmatter('title: "  "')), /缺少標題/)
  assert.throws(() => parseSyncFile(frontmatter('- a\n- b')), /格式錯誤/)
  assert.throws(() => parseSyncFile(frontmatter('title: [')), /無法解析/)
})

function writeSyncFile(name: string, text: string): string {
  const file = path.join(dataDir(), 'sync', name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

test('processSyncFile creates, skips and updates the post of a file', () => {
  const file = writeSyncFile('a.md', frontmatter('title: 第一版\ndate: 2026-05-08'))
  const first = processSyncFile(dataDir(), file)
  assert.equal(first.action, 'created')
  assert.equal(first.file, 'sync/a.md')
  assert.equal(processSyncFile(dataDir(), file).action, 'skipped')

  fs.writeFileSync(file, frontmatter('title: 第二版\ndate: 2026-02-30'))
  const second = processSyncFile(dataDir(), file)
  assert.equal(second.action, 'updated')
  assert.match(second.message ?? '', /日期「2026-02-30」無法辨識/)
  const post = findPostBySyncSource('sync/a.md')
  assert.equal(post?.title, '第二版')
  assert.equal(post?.scheduled_date, null)
  assert.match(post?.sync_hash ?? '', /^sha256:[0-9a-f]{64}$/)
})

test('a sync file only moves the status from draft to confirmed', () => {
  const file = writeSyncFile('status.md', frontmatter('title: 狀態'))
  processSyncFile(dataDir(), file)
  const id = findPostBySyncSource('sync/status.md')?.id ?? ''
  assert.equal(getPostById(id)?.status, 'draft')

  fs.writeFileSync(file, frontmatter('title: 狀態\nstatus: confirmed'))
  processSyncFile(dataDir(), file)
  assert.equal(getPostById(id)?.status, 'confirmed')

  updatePost(id, { status: 'published' })
  fs.writeFileSync(file, frontmatter('title: 狀態\nstatus: draft'))
  processSyncFile(dataDir(), file)
  assert.equal(getPostById(id)?.status, 'published')
})

test('a sync file keeps published platforms and drops unpublished ones it no longer lists', () => {
  const file = writeSyncFile('platforms.md', frontmatter('title: 平台\nplatforms: [Facebook, Threads]'))
  processSyncFile(dataDir(), file)
  const post = findPostBySyncSource('sync/platforms.md')
  const facebook = getPostById(post?.id ?? '')?.platforms.find((p) => p.platform_name === 'Facebook')
  togglePostPlatformPublished(facebook?.id ?? '')

  fs.writeFileSync(file, frontmatter('title: 平台\nplatforms: [LINE, 小紅書]'))
  processSyncFile(dataDir(), file)
  const names = getPostById(post?.id ?? '')?.platforms.map((p) => [p.platform_name, p.published])
  assert.deepEqual(names?.sort(), [
    ['Facebook', true],
    ['LINE', false],
    ['小紅書', false]
  ].sort())
})

test('processSyncFile reports a broken file as an error event instead of throwing', () => {
  const file = writeSyncFile('broken.md', frontmatter('date: 2026-05-08'))
  const event = processSyncFile(dataDir(), file)
  assert.equal(event.action, 'error')
  assert.equal(event.message, '缺少標題（title）')
  assert.equal(findPostBySyncSource('sync/broken.md'), undefined)
  assert.equal(processSyncFile(dataDir(), path.join(dataDir(), 'sync', 'missing.md')).action, 'error')
})
