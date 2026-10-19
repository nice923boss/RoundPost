import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  importFile,
  parseDateCell,
  parseStatus,
  parseTimeCell,
  previewImport,
  splitPlatformNames,
  suggestMapping
} from '../electron/services/importService.ts'
import { excelSerialToText, readXlsx } from '../electron/services/xlsxReader.ts'
import { getProjectDb } from '../electron/db/connection.ts'
import { getAllPosts } from '../electron/db/repositories/postRepository.ts'
import { useTempDatabases } from './helpers.ts'

const dataDir = useTempDatabases()
const FIXTURES = path.join(import.meta.dirname, 'fixtures')

function writeFile(name: string, text: string): string {
  const file = path.join(dataDir(), name)
  fs.writeFileSync(file, text)
  return file
}

function clearPosts(): void {
  getProjectDb().exec('DELETE FROM posts')
}

test('suggestMapping recognises Chinese and English headers', () => {
  assert.deepEqual(suggestMapping(['貼文標題', 'Ｃｏｎｔｅｎｔ', ' 發文 日期 ', 'TIME', '社群平台', 'Status', '備註']), {
    title: '貼文標題',
    content: 'Ｃｏｎｔｅｎｔ',
    date: ' 發文 日期 ',
    time: 'TIME',
    platforms: '社群平台',
    status: 'Status'
  })
  assert.deepEqual(suggestMapping(['標題', '主題']), { title: '標題' })
  assert.deepEqual(suggestMapping(['備註']), {})
})

test('parseDateCell reads common date formats and the Republic of China calendar', () => {
  const date = (text: string) => parseDateCell(text)
  assert.deepEqual(date('2026-05-08'), { date: '2026-05-08', time: null })
  assert.deepEqual(date('2026年5月8日'), { date: '2026-05-08', time: null })
  assert.deepEqual(date('115/5/8'), { date: '2026-05-08', time: null })
  assert.deepEqual(date('民國115年5月8日'), { date: '2026-05-08', time: null })
  assert.deepEqual(date('１１５．５．８'), { date: '2026-05-08', time: null })
  assert.deepEqual(date('2026/5/8 09:30'), { date: '2026-05-08', time: '09:30' })
  assert.deepEqual(date('2026/5/8（五）下午3點'), { date: '2026-05-08', time: '15:00' })
  assert.deepEqual(date('2026-05-08T09:30'), { date: '2026-05-08', time: '09:30' })
  assert.deepEqual(date('45000'), { date: '2023-03-15', time: null })
  assert.deepEqual(date('45000.5'), { date: '2023-03-15', time: '12:00' })
  assert.deepEqual(date(''), { date: null, time: null })
  assert.equal(date('2026-02-30'), undefined)
  assert.equal(date('26/5/8'), undefined)
  assert.equal(date('民國2026/5/8'), undefined)
  assert.equal(date('2026/5/8 25:00'), undefined)
  assert.equal(date('下週'), undefined)
})

test('parseTimeCell reads clock, spoken and fractional times', () => {
  const cases: [string, string | null | undefined][] = [
    ['09:30', '09:30'],
    ['9:30:00', '09:30'],
    ['下午3點', '15:00'],
    ['3點半', '03:30'],
    ['晚上8點15分', '20:15'],
    ['中午12點', '12:00'],
    ['12:15 am', '00:15'],
    ['12 pm', '12:00'],
    ['3:30 P.M.', '15:30'],
    ['0.5', '12:00'],
    ['.75', '18:00'],
    ['0', '00:00'],
    ['', null],
    ['25:00', undefined],
    ['1.5', undefined],
    ['晚點', undefined]
  ]
  for (const [text, expected] of cases) assert.equal(parseTimeCell(text), expected, text)
})

test('parseStatus and splitPlatformNames', () => {
  assert.equal(parseStatus('已排程'), 'confirmed')
  assert.equal(parseStatus(' Published '), 'published')
  assert.equal(parseStatus('已發文'), 'published')
  assert.equal(parseStatus('不知道'), 'draft')
  assert.equal(parseStatus(''), 'draft')
  assert.deepEqual(splitPlatformNames('Facebook、IG / LINE;facebook|Threads\nＩＧ'), ['Facebook', 'IG', 'LINE', 'Threads'])
  assert.deepEqual(splitPlatformNames(''), [])
})

test('excelSerialToText converts day numbers in both date systems', () => {
  assert.equal(excelSerialToText(45000), '2023-03-15')
  assert.equal(excelSerialToText(0.5), '12:00')
  assert.equal(excelSerialToText(45000.75), '2023-03-15 18:00')
  assert.equal(excelSerialToText(43538, true), '2023-03-15')
})

test('readXlsx reads the first visible sheet with dates, times, numbers and blank rows', () => {
  assert.deepEqual(readXlsx(fs.readFileSync(path.join(FIXTURES, 'sample.xlsx'))), [
    ['標題', '內文', '發文日期', '時間', '平台', '狀態', '數量'],
    ['春季活動', '第一行\n第二行', '2026-05-08', '09:30', 'Facebook、IG', '已確認', '3'],
    [],
    ['夏日特賣', '', '2026-07-01 20:00', '', 'LINE', '草稿', '1.5'],
    ['', '沒有標題'],
    ['民國日期', '', '115/5/9', '下午3點']
  ])
})

test('readXlsx rejects files that are not .xlsx packages', () => {
  assert.throws(() => readXlsx(Buffer.from('標題,日期\n')), /不是有效的 \.xlsx 檔/)
  assert.throws(() => readXlsx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), /舊版 \.xls/)
})

test('previewImport names blank and repeated headers and suggests a mapping', () => {
  const file = writeFile('preview.csv', ' 標題 ,,日期,日期\n一,a,2026-05-08,x\n\n二,b,,\n')
  const preview = previewImport(file)
  assert.deepEqual(preview.headers, ['標題', '欄位2', '日期', '日期 (2)'])
  assert.equal(preview.totalRows, 2)
  assert.deepEqual(preview.sampleRows[0], { 標題: '一', 欄位2: 'a', 日期: '2026-05-08', '日期 (2)': 'x' })
  assert.deepEqual(preview.suggestedMapping, { title: '標題', date: '日期' })
})

test('importFile creates posts, reports bad rows with sheet row numbers and skips repeats', () => {
  clearPosts()
  const file = writeFile(
    'posts.csv',
    [
      '標題,內容,日期,時間,平台,狀態',
      '春季活動,"第一行\n第二行",2026/5/8,9:30,"Facebook、IG",已確認',
      '',
      ',沒有標題,2026/5/9,,,',
      '日期錯,x,明天,,,',
      '時間錯,x,2026/5/9,晚點,,',
      '未排程,,,,LINE,',
      '日期含時間,,2026/5/10 20:00,,,'
    ].join('\n')
  )
  const mapping = { title: '標題', content: '內容', date: '日期', time: '時間', platforms: '平台', status: '狀態' }
  const result = importFile(file, mapping)
  assert.equal(result.imported, 3)
  assert.equal(result.skipped, 0)
  // A line break inside quotes stays in one row, as Excel shows it; the blank row still counts.
  assert.deepEqual(
    result.errors.map((e) => e.row),
    [4, 5, 6]
  )
  assert.match(result.errors[0].message, /標題是空的/)
  assert.match(result.errors[1].message, /日期「明天」無法辨識/)
  assert.match(result.errors[2].message, /時間「晚點」無法辨識/)
  assert.deepEqual(result.unknownPlatforms, ['IG'])

  const posts = new Map(getAllPosts().map((p) => [p.title, p]))
  const spring = posts.get('春季活動')
  assert.equal(spring?.content_html, '<p>第一行<br>第二行</p>')
  assert.equal(spring?.scheduled_time, '09:30')
  assert.equal(spring?.status, 'confirmed')
  assert.deepEqual(
    spring?.platforms.map((p) => p.platform_name),
    ['Facebook']
  )
  assert.equal(posts.get('未排程')?.scheduled_date, null)
  assert.equal(posts.get('日期含時間')?.scheduled_time, '20:00')

  const again = importFile(file, mapping)
  assert.equal(again.imported, 0)
  assert.equal(again.skipped, 3)
  assert.equal(getAllPosts().length, 3)
})

test('importFile reads Big5 CSV files and .xlsx files', () => {
  clearPosts()
  const big5 = importFile(path.join(FIXTURES, 'big5.csv'), {
    title: '標題',
    content: '內容',
    date: '日期',
    time: '時間',
    platforms: '平台',
    status: '狀態'
  })
  assert.equal(big5.imported, 1)
  const [post] = getAllPosts()
  assert.equal(post.title, '中文標題')
  assert.equal(post.scheduled_date, '2026-05-08')
  assert.equal(post.scheduled_time, '15:00')
  assert.equal(post.status, 'confirmed')
  assert.equal(post.content, '第一行\n第二行')

  clearPosts()
  const xlsx = importFile(path.join(FIXTURES, 'sample.xlsx'), {
    title: '標題',
    content: '內文',
    date: '發文日期',
    time: '時間',
    platforms: '平台',
    status: '狀態'
  })
  assert.equal(xlsx.imported, 3)
  assert.deepEqual(xlsx.errors, [{ row: 5, message: '標題是空的，未匯入' }])
  assert.deepEqual(xlsx.unknownPlatforms, ['IG'])
  const byTitle = new Map(getAllPosts().map((p) => [p.title, p]))
  assert.equal(byTitle.get('夏日特賣')?.scheduled_time, '20:00')
  assert.equal(byTitle.get('民國日期')?.scheduled_date, '2026-05-09')
  assert.equal(byTitle.get('民國日期')?.scheduled_time, '15:00')
})

test('importFile explains files it cannot read', () => {
  const mapping = { title: '標題' }
  assert.throws(() => importFile(writeFile('old.xls', 'x'), mapping), /不支援舊版 \.xls 檔/)
  assert.throws(() => importFile(writeFile('notes.docx', 'x'), mapping), /不支援的檔案格式：\.docx/)
  assert.throws(() => importFile(path.join(dataDir(), 'missing.csv'), mapping), /找不到檔案/)
  assert.throws(() => importFile(writeFile('empty.csv', '\n\n'), mapping), /檔案是空的/)
  assert.throws(() => importFile(writeFile('header.csv', '標題,日期\n'), mapping), /只有標題列/)
  assert.throws(() => importFile(writeFile('quotes.csv', '標題\n"沒有結尾\n'), mapping), /引號沒有成對/)
  const ok = writeFile('ok.csv', '標題\n一\n')
  assert.throws(() => importFile(ok, { title: '' }), /請選擇標題欄位/)
  assert.throws(() => importFile(ok, { title: '主題' }), /找不到欄位「主題」/)
})
