import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildImportTemplate } from '../electron/services/importTemplate.ts'
import { importFile, previewImport } from '../electron/services/importService.ts'
import { readXlsx } from '../electron/services/xlsxReader.ts'
import { XLSX_STYLE, toExcelDate, toExcelTime, writeXlsx } from '../electron/services/xlsxWriter.ts'
import { getProjectDb } from '../electron/db/connection.ts'
import { getAllPlatforms } from '../electron/db/repositories/platformRepository.ts'
import { getAllPosts } from '../electron/db/repositories/postRepository.ts'
import { useTempDatabases } from './helpers.ts'

const dataDir = useTempDatabases()
// A Thursday; the example posts are dated the day after and three days after.
const TODAY = new Date(2026, 4, 7)

function saveTemplate(name: string, platformNames: string[]): string {
  const file = path.join(dataDir(), name)
  fs.writeFileSync(file, buildImportTemplate(platformNames, TODAY))
  return file
}

test('toExcelDate and toExcelTime match the spreadsheet day numbers', () => {
  assert.equal(toExcelDate(1900, 3, 1), 61)
  assert.equal(toExcelDate(2023, 3, 15), 45000)
  assert.equal(toExcelTime(12, 0), 0.5)
  assert.equal(toExcelTime(0, 0), 0)
})

test('writeXlsx output reads back with escaped text, dates and times', () => {
  const data = writeXlsx([
    {
      name: '工作表 & <一>',
      columns: [{ width: 10 }],
      rows: [
        ['符號 <&> "引號"', '換行\n第二行', '控制\u0001字元'],
        [
          { value: toExcelDate(2026, 5, 8), style: XLSX_STYLE.date },
          { value: toExcelTime(21, 5), style: XLSX_STYLE.time },
          { value: 3, style: XLSX_STYLE.text }
        ]
      ]
    },
    { name: '第二張', columns: [], rows: [['不會被讀到']] }
  ])
  assert.deepEqual(readXlsx(data), [
    ['符號 <&> "引號"', '換行\n第二行', '控制\u0001字元'],
    ['2026-05-08', '21:05', '3']
  ])
  assert.throws(() => writeXlsx([]), /至少要有一個工作表/)
})

test('the template has the importer headers and example rows for the current platforms', () => {
  const names = getAllPlatforms().map((p) => p.name)
  assert.ok(names.length >= 2, 'the default platforms are seeded')
  const file = saveTemplate('範本.xlsx', names)
  assert.deepEqual(readXlsx(fs.readFileSync(file)), [
    ['標題', '內容', '日期', '時間', '平台', '狀態'],
    ['【範例】新品上市預告', '內容可以直接換行。\n第二行文字\n#hashtag 也可以寫在這裡', '2026-05-08', '09:30', `${names[0]}、${names[1]}`, '草稿'],
    ['【範例】週末活動提醒', '同一篇要發到多個平台時，平台欄用「、」或逗號分隔。', '2026-05-10', '20:00', names[0], '已確認'],
    ['【範例】還沒決定日期的草稿', '日期留空會變成未排程的草稿，之後再拖到行事曆上。', '', '', '', '草稿']
  ])
  assert.deepEqual(buildImportTemplate(names, TODAY), fs.readFileSync(file), 'the same input gives the same bytes')
})

test('the template imports with the suggested mapping and no errors', () => {
  getProjectDb().exec('DELETE FROM posts')
  const platforms = getAllPlatforms()
  const file = saveTemplate('匯入.xlsx', platforms.map((p) => p.name))
  const preview = previewImport(file)
  assert.deepEqual(preview.suggestedMapping, {
    title: '標題',
    content: '內容',
    date: '日期',
    time: '時間',
    platforms: '平台',
    status: '狀態'
  })
  assert.equal(preview.totalRows, 3)

  const result = importFile(file, { ...preview.suggestedMapping, title: '標題' })
  assert.deepEqual(result, { imported: 3, skipped: 0, errors: [], unknownPlatforms: [] })
  const byTitle = new Map(getAllPosts().map((p) => [p.title, p]))
  const first = byTitle.get('【範例】新品上市預告')
  assert.equal(first?.scheduled_date, '2026-05-08')
  assert.equal(first?.scheduled_time, '09:30')
  assert.equal(first?.status, 'draft')
  assert.deepEqual(
    first?.platforms.map((p) => p.platform_id),
    platforms.slice(0, 2).map((p) => p.id)
  )
  assert.equal(byTitle.get('【範例】週末活動提醒')?.status, 'confirmed')
  const unscheduled = byTitle.get('【範例】還沒決定日期的草稿')
  assert.equal(unscheduled?.scheduled_date, null)
  assert.equal(unscheduled?.scheduled_time, null)

  // Importing the same file again creates nothing.
  assert.equal(importFile(file, { ...preview.suggestedMapping, title: '標題' }).skipped, 3)
})

test('a template made before any platform exists still imports', () => {
  getProjectDb().exec('DELETE FROM posts')
  const file = saveTemplate('無平台.xlsx', [])
  const result = importFile(file, { ...previewImport(file).suggestedMapping, title: '標題' })
  assert.equal(result.imported, 3)
  assert.deepEqual(result.errors, [])
})
