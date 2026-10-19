import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getGlobalDb, getProjectDb } from '../electron/db/connection.ts'
import { GLOBAL_SCHEMA_VERSION, PROJECT_SCHEMA_VERSION } from '../electron/db/schema.ts'
import {
  createPlatform,
  deletePlatform,
  ensurePlatform,
  findPlatformByName,
  getAllPlatforms,
  updatePlatform
} from '../electron/db/repositories/platformRepository.ts'
import {
  addPlatformToPost,
  createPost,
  deletePost,
  getAllPosts,
  getPostById,
  markPublishedByDate,
  postExists,
  removePlatformFromPost,
  searchPosts,
  togglePostPlatformPublished,
  updatePost
} from '../electron/db/repositories/postRepository.ts'
import { createTemplate, deleteTemplate, getAllTemplates, updateTemplate } from '../electron/db/repositories/templateRepository.ts'
import { getSetting, setSetting } from '../electron/db/repositories/settingsRepository.ts'
import { useTempDatabases } from './helpers.ts'

useTempDatabases()

function clearPosts(): void {
  getProjectDb().exec('DELETE FROM posts')
}

function titles(posts: { title: string }[]): string[] {
  return posts.map((p) => p.title)
}

test('new databases are at the latest schema with the default platforms', () => {
  const version = (db: ReturnType<typeof getGlobalDb>) => db.get<{ version: number }>('SELECT version FROM _schema_version')?.version
  assert.equal(version(getGlobalDb()), GLOBAL_SCHEMA_VERSION)
  assert.equal(version(getProjectDb()), PROJECT_SCHEMA_VERSION)
  assert.deepEqual(
    getAllPlatforms().map((p) => [p.name, p.icon]),
    [
      ['Facebook', 'FB'],
      ['Instagram', 'IG'],
      ['Threads', 'TH'],
      ['LINE', 'LN'],
      ['ACCUPASS', 'AP']
    ]
  )
})

test('platform names are unique regardless of case and spaces', () => {
  assert.throws(() => createPlatform({ name: ' facebook ' }), /已有名為「Facebook」的平台/)
  assert.equal(findPlatformByName('  line ')?.id, 'plat-line')
  assert.equal(updatePlatform('plat-line', { name: 'LINE', notes: '官方帳號' })?.notes, '官方帳號')
  assert.throws(() => updatePlatform('plat-line', { name: 'threads' }), /已有名為/)

  const youtube = ensurePlatform('YouTube')
  assert.equal(youtube.icon, 'YT')
  assert.equal(youtube.sort_order, 6)
  assert.equal(ensurePlatform(' youtube ').id, youtube.id)
  assert.equal(ensurePlatform('小紅書').icon, '小紅')
})

test('createPost sanitizes the HTML and derives the plain text', () => {
  clearPosts()
  const post = createPost({
    title: '  春季活動  ',
    content_html: '<p onclick="x()">報名<script>alert(1)</script>開始</p><p>第二段</p>',
    scheduled_date: '2026-05-08',
    platform_ids: ['plat-facebook', 'plat-instagram']
  })
  assert.equal(post.title, '春季活動')
  assert.equal(post.content_html, '<p>報名開始</p><p>第二段</p>')
  assert.equal(post.content, '報名開始\n\n第二段')
  assert.equal(post.status, 'draft')
  assert.deepEqual(
    post.platforms.map((p) => [p.platform_name, p.published]),
    [
      ['Facebook', false],
      ['Instagram', false]
    ]
  )
  assert.equal(postExists('春季活動', '2026-05-08'), true)
  assert.equal(postExists('春季活動', null), false)
})

test('updatePost keeps undefined fields and clears null ones', () => {
  clearPosts()
  const post = createPost({ title: '原標題', scheduled_date: '2026-05-08', scheduled_time: '09:00' })
  const kept = updatePost(post.id, { title: '新標題' })
  assert.equal(kept.title, '新標題')
  assert.equal(kept.scheduled_date, '2026-05-08')
  assert.equal(kept.scheduled_time, '09:00')
  const cleared = updatePost(post.id, { scheduled_date: null, scheduled_time: null })
  assert.equal(cleared.scheduled_date, null)
  assert.equal(cleared.scheduled_time, null)
  assert.equal(postExists('新標題', null), true)
})

test('platforms can be added and removed, and deleting a post removes its platform rows', () => {
  clearPosts()
  const post = createPost({ title: '平台測試', platform_ids: ['plat-facebook'] })
  assert.equal(addPlatformToPost(post.id, 'plat-threads').platforms.length, 2)
  assert.throws(() => addPlatformToPost(post.id, 'missing-platform'))
  assert.deepEqual(
    removePlatformFromPost(post.id, 'plat-facebook').platforms.map((p) => p.platform_id),
    ['plat-threads']
  )
  assert.equal(deletePost(post.id), true)
  assert.equal(deletePost(post.id), false)
  assert.equal(getPostById(post.id), undefined)
  assert.equal(getProjectDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM post_platforms')?.c, 0)
})

test('platform names on posts follow a rename', () => {
  clearPosts()
  const platform = createPlatform({ name: 'Blog' })
  const post = createPost({ title: '改名測試', platform_ids: [platform.id] })
  updatePlatform(platform.id, { name: '部落格' })
  assert.equal(getPostById(post.id)?.platforms[0].platform_name, '部落格')
  deletePlatform(platform.id)
})

test('getAllPosts lists dated posts first and applies filters', () => {
  clearPosts()
  createPost({ title: '未排程' })
  createPost({ title: '五月九日', scheduled_date: '2026-05-09', status: 'confirmed' })
  createPost({ title: '五月八日晚上', scheduled_date: '2026-05-08', scheduled_time: '20:00', platform_ids: ['plat-line'] })
  createPost({ title: '五月八日早上', scheduled_date: '2026-05-08', scheduled_time: '09:00' })
  const ordered = ['五月八日早上', '五月八日晚上', '五月九日', '未排程']
  assert.deepEqual(titles(getAllPosts()), ordered)
  assert.deepEqual(titles(getAllPosts({})), ordered)
  assert.deepEqual(titles(getAllPosts({ status: 'confirmed' })), ['五月九日'])
  assert.deepEqual(titles(getAllPosts({ date_from: '2026-05-09', date_to: '2026-05-31' })), ['五月九日'])
  assert.deepEqual(titles(getAllPosts({ platform_id: 'plat-line' })), ['五月八日晚上'])
})

test('searchPosts uses the full text index for longer words and LIKE for short ones', () => {
  clearPosts()
  createPost({ title: '春季新品發表會', content_html: '<p>歡迎蒞臨，現場有試吃</p>', platform_ids: ['plat-facebook'] })
  createPost({ title: '夏日特賣', content_html: '<p>全館 100% 回饋，新品發表也在這週</p>' })
  createPost({ title: '秋季講座', content_html: '<p>名額 1000 位</p>' })

  assert.deepEqual(titles(searchPosts('新品發表')).sort(), ['夏日特賣', '春季新品發表會'].sort())
  assert.deepEqual(titles(searchPosts('新品發表', { platform_id: 'plat-facebook' })), ['春季新品發表會'])
  assert.deepEqual(titles(searchPosts('試吃')), ['春季新品發表會'])
  assert.deepEqual(titles(searchPosts('0%')), ['夏日特賣'])
  assert.deepEqual(titles(searchPosts('新品發表 回饋')), ['夏日特賣'])
  assert.deepEqual(titles(searchPosts('不存在的字')), [])
  assert.deepEqual(titles(searchPosts('"引號"')), [])
  assert.equal(searchPosts('   ').length, 3)
})

test('the search index follows edits and deletes', () => {
  clearPosts()
  const post = createPost({ title: '原本的標題', content_html: '<p>第一版內容</p>' })
  updatePost(post.id, { content_html: '<p>改寫後的文字</p>' })
  assert.deepEqual(titles(searchPosts('第一版')), [])
  assert.deepEqual(titles(searchPosts('改寫後')), ['原本的標題'])
  deletePost(post.id)
  assert.deepEqual(titles(searchPosts('改寫後')), [])
  assert.equal(getProjectDb().get<{ c: number }>('SELECT COUNT(*) AS c FROM posts_fts')?.c, 0)
})

test('markPublishedByDate only publishes confirmed posts of that day', () => {
  clearPosts()
  const confirmed = createPost({
    title: '已確認',
    scheduled_date: '2026-05-08',
    status: 'confirmed',
    platform_ids: ['plat-facebook', 'plat-instagram']
  })
  const draft = createPost({ title: '草稿', scheduled_date: '2026-05-08', platform_ids: ['plat-facebook'] })
  const otherDay = createPost({ title: '隔天', scheduled_date: '2026-05-09', status: 'confirmed' })

  assert.equal(markPublishedByDate('2026-05-08'), 1)
  const published = getPostById(confirmed.id)
  assert.equal(published?.status, 'published')
  assert.ok(published?.platforms.every((p) => p.published && p.published_at))
  assert.equal(getPostById(draft.id)?.status, 'draft')
  assert.equal(getPostById(draft.id)?.platforms[0].published, false)
  assert.equal(getPostById(otherDay.id)?.status, 'confirmed')
  assert.equal(markPublishedByDate('2026-05-08'), 0)
})

test('togglePostPlatformPublished switches one platform', () => {
  clearPosts()
  const post = createPost({ title: '切換', platform_ids: ['plat-threads'] })
  const id = post.platforms[0].id
  const on = togglePostPlatformPublished(id).platforms[0]
  assert.equal(on.published, true)
  assert.ok(on.published_at)
  const off = togglePostPlatformPublished(id).platforms[0]
  assert.equal(off.published, false)
  assert.equal(off.published_at, null)
  assert.throws(() => togglePostPlatformPublished('missing'), /找不到貼文平台/)
})

test('templates are sorted by name and can be edited', () => {
  const b = createTemplate({ name: 'b 活動', content: '{{日期}}' })
  createTemplate({ name: 'A 公告', content: '' })
  assert.deepEqual(
    getAllTemplates().map((t) => t.name),
    ['A 公告', 'b 活動']
  )
  assert.equal(updateTemplate(b.id, { content: '新內容' })?.name, 'b 活動')
  assert.equal(updateTemplate('missing', { name: 'x' }), undefined)
  assert.equal(deleteTemplate(b.id), true)
  assert.equal(getAllTemplates().length, 1)
})

test('settings round trip', () => {
  assert.equal(getSetting('theme'), undefined)
  setSetting('theme', 'dark')
  setSetting('theme', 'light')
  assert.equal(getSetting('theme'), 'light')
})
