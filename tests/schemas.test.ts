import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ColumnMapping, CreatePost, DateText, PlatformInput, PostFilters, TimeText, UpdatePost } from '../electron/ipc/schemas.ts'

test('DateText accepts real calendar dates only', () => {
  assert.equal(DateText.safeParse('2024-02-29').success, true)
  assert.equal(DateText.safeParse('2026-02-29').success, false)
  assert.equal(DateText.safeParse('2026-02-30').success, false)
  assert.equal(DateText.safeParse('2026-13-01').success, false)
  assert.equal(DateText.safeParse('2026-5-8').success, false)
})

test('TimeText accepts HH:mm from 00:00 to 23:59', () => {
  assert.equal(TimeText.safeParse('00:00').success, true)
  assert.equal(TimeText.safeParse('23:59').success, true)
  assert.equal(TimeText.safeParse('24:00').success, false)
  assert.equal(TimeText.safeParse('9:00').success, false)
})

test('CreatePost trims the title and rejects unknown fields', () => {
  assert.equal(CreatePost.parse({ title: '  春季活動  ' }).title, '春季活動')
  assert.equal(CreatePost.safeParse({ title: '   ' }).success, false)
  assert.equal(CreatePost.safeParse({ title: 'x', id: 'injected' }).success, false)
  assert.equal(CreatePost.safeParse({ title: 'x', scheduled_date: null, scheduled_time: null }).success, true)
  assert.equal(CreatePost.safeParse({ title: 'x', status: 'archived' }).success, false)
})

test('UpdatePost and PostFilters are strict', () => {
  assert.equal(UpdatePost.safeParse({}).success, true)
  assert.equal(UpdatePost.safeParse({ sync_source: 'x' }).success, false)
  assert.equal(PostFilters.safeParse(undefined).success, true)
  assert.equal(PostFilters.safeParse({ platform_id: 'plat-facebook' }).success, true)
  assert.equal(PostFilters.safeParse({ date_from: '2026-02-30' }).success, false)
})

test('PlatformInput only allows http and https links', () => {
  assert.equal(PlatformInput.safeParse({ name: 'FB', url: '' }).success, true)
  assert.equal(PlatformInput.safeParse({ name: 'FB', url: 'https://www.facebook.com/' }).success, true)
  assert.equal(PlatformInput.safeParse({ name: 'FB', url: 'javascript:alert(1)' }).success, false)
  assert.equal(PlatformInput.safeParse({ name: 'FB', url: 'file:///C:/Windows' }).success, false)
  assert.equal(PlatformInput.safeParse({ name: ' ' }).success, false)
})

test('ColumnMapping requires a title column', () => {
  assert.equal(ColumnMapping.safeParse({ title: '' }).success, false)
  assert.equal(ColumnMapping.safeParse({ title: '標題', date: '日期' }).success, true)
})
