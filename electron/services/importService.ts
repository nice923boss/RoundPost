// Imports posts from a spreadsheet: .xlsx, or text files with comma or tab separated values.
// Free of electron imports so it can be tested.
import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { decodeText } from './textDecode.ts'
import { excelSerialToText, readXlsx } from './xlsxReader.ts'
import { plainTextToHtml } from './html.ts'
import { getProjectDb } from '../db/connection.ts'
import { findPlatformByName } from '../db/repositories/platformRepository.ts'
import { createPost, postExists } from '../db/repositories/postRepository.ts'
import type { ColumnMapping, ImportPreview, ImportResult, ImportRowError, PostStatus } from '../../shared/types.ts'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const TEXT_EXTENSIONS = new Set(['.csv', '.tsv', '.txt'])
/** Extensions offered by the file dialog. */
export const IMPORT_EXTENSIONS = ['csv', 'tsv', 'txt', 'xlsx']
const SAMPLE_ROWS = 5

interface TableRow {
  /** 1-based row number as a spreadsheet shows it */
  number: number
  cells: string[]
}

interface Table {
  headers: string[]
  rows: TableRow[]
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function readFailure(file: string, err: unknown): Error {
  const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
  const message =
    code === 'ENOENT'
      ? `找不到檔案：${file}`
      : code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
        ? '檔案正被其他程式使用或沒有讀取權限，請關閉 Excel 等程式後再試'
        : `無法讀取檔案：${err instanceof Error ? err.message : String(err)}`
  return new Error(message, { cause: err })
}

function readBytes(file: string): Buffer {
  try {
    if (fs.statSync(file).size <= MAX_FILE_BYTES) return fs.readFileSync(file)
  } catch (err) {
    throw readFailure(file, err)
  }
  throw new Error('檔案超過 20MB，請分批匯入')
}

function parseDelimited(text: string, delimiter?: string): string[][] {
  const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: false, delimiter })
  // Delimiter errors only mean the file has a single column, which is fine.
  const quoteError = result.errors.find((error) => error.type === 'Quotes')
  if (quoteError) {
    const where = quoteError.row === undefined ? '檔案中' : `第 ${quoteError.row + 1} 列`
    throw new Error(`${where}的引號沒有成對，請檢查檔案內容`)
  }
  return result.data
}

function readRows(file: string): string[][] {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.xls') throw new Error('不支援舊版 .xls 檔，請在 Excel 另存為 .xlsx 後再匯入')
  if (ext !== '.xlsx' && !TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`不支援的檔案格式：${ext || '（無副檔名）'}（可匯入 .csv、.tsv、.txt、.xlsx）`)
  }
  const bytes = readBytes(file)
  if (ext === '.xlsx') return readXlsx(bytes)
  return parseDelimited(decodeText(bytes), ext === '.tsv' ? '\t' : undefined)
}

/** Number of cells up to the last one that is not empty. */
function usedWidth(cells: string[]): number {
  let width = cells.length
  while (width > 0 && cells[width - 1] === '') width--
  return width
}

/** Blank headers get a generated name and repeated ones a number, so every column can be picked. */
function uniqueHeaders(cells: string[], width: number): string[] {
  const used = new Set<string>()
  const headers: string[] = []
  for (let i = 0; i < width; i++) {
    const base = cells[i] || `欄位${i + 1}`
    let name = base
    for (let n = 2; used.has(name); n++) name = `${base} (${n})`
    used.add(name)
    headers.push(name)
  }
  return headers
}

/** The first row with any value is the header row; blank rows are dropped but keep their numbering. */
function toTable(records: string[][]): Table {
  const rows: TableRow[] = []
  records.forEach((record, index) => {
    const cells = record.map((cell) => String(cell ?? '').trim())
    if (cells.some(Boolean)) rows.push({ number: index + 1, cells })
  })
  if (rows.length === 0) throw new Error('檔案是空的')
  if (rows.length === 1) throw new Error('檔案只有標題列，沒有資料')
  const width = rows.reduce((max, row) => Math.max(max, usedWidth(row.cells)), 0)
  return { headers: uniqueHeaders(rows[0].cells, width), rows: rows.slice(1) }
}

const HEADER_ALIASES: [keyof ColumnMapping, string[]][] = [
  ['title', ['標題', '主題', 'title', '名稱', '貼文標題']],
  ['content', ['內容', '內文', 'content', 'body', '文案', '貼文內容']],
  ['date', ['日期', '發文日期', '排程日期', 'date', 'scheduled_date', '發佈日期', '發布日期']],
  ['time', ['時間', '發文時間', 'time', 'scheduled_time']],
  ['platforms', ['平台', 'platforms', 'platform', '發佈平台', '發布平台', '社群平台']],
  ['status', ['狀態', 'status']]
]

function headerKey(header: string): string {
  return header.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

/** Guesses the mapping from common Chinese and English header names. Each header is used once. */
export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {}
  const taken = new Set<string>()
  for (const [field, aliases] of HEADER_ALIASES) {
    const keys = new Set(aliases.map(headerKey))
    const header = headers.find((h) => !taken.has(h) && keys.has(headerKey(h)))
    if (header === undefined) continue
    mapping[field] = header
    taken.add(header)
  }
  return mapping
}

const DATE_PREFIX = /^(\d{2,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/
const EXCEL_SERIAL = /^\d{5}(\.\d+)?$/
const WEEKDAY = /^(?:\(\s*(?:星期|週|周|禮拜)?[一二三四五六日天]\s*\)|(?:星期|週|周|禮拜)[一二三四五六日天])/

/**
 * Reads a date cell such as 2026-05-08, 2026/5/8 09:30, 2026年5月8日, 115/5/8 or 民國115年5月8日 (years of the
 * Republic of China calendar), or an Excel day number. An empty cell means unscheduled; undefined means unreadable.
 */
export function parseDateCell(text: string): { date: string | null; time: string | null } | undefined {
  let value = text.normalize('NFKC').trim()
  if (value === '') return { date: null, time: null }
  if (EXCEL_SERIAL.test(value)) value = excelSerialToText(Number(value))
  const roc = value.startsWith('民國')
  if (roc) value = value.slice(2).trim()
  const match = DATE_PREFIX.exec(value)
  if (!match) return undefined
  const digits = match[1].length
  // Two-digit years are ambiguous; three digits are always a Republic of China year.
  if (roc ? digits === 4 : digits === 2) return undefined
  const year = Number(match[1]) + (roc || digits === 3 ? 1911 : 0)
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return undefined
  }
  const rest = value
    .slice(match[0].length)
    .trim()
    .replace(WEEKDAY, '')
    .trim()
    .replace(/^t(?=\d)/i, '')
  const time = rest === '' ? null : parseTimeCell(rest)
  if (time === undefined) return undefined
  return { date: `${year}-${pad2(month)}-${pad2(day)}`, time }
}

const MERIDIEM_PREFIX = /^(上午|早上|凌晨|清晨|am|中午|下午|晚上|傍晚|pm)\s*/
const AM_WORDS = new Set(['上午', '早上', '凌晨', '清晨', 'am'])
const MERIDIEM_SUFFIX = /\s*([ap])\.?\s*m\.?$/

/**
 * Reads a time cell such as 09:30, 9:30:00, 下午3點, 3點半, 3:30 pm or an Excel fraction of a day.
 * An empty cell means no time; undefined means unreadable.
 */
export function parseTimeCell(text: string): string | null | undefined {
  let value = text.normalize('NFKC').trim().toLowerCase()
  if (value === '') return null
  if (/^(0|0?\.\d+)$/.test(value)) {
    const minutes = Math.round(Number(value) * 1440)
    return minutes < 1440 ? `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}` : undefined
  }

  let meridiem: 'am' | 'pm' | null = null
  const prefix = MERIDIEM_PREFIX.exec(value)
  const suffix = prefix ? null : MERIDIEM_SUFFIX.exec(value)
  if (prefix) {
    meridiem = AM_WORDS.has(prefix[1]) ? 'am' : 'pm'
    value = value.slice(prefix[0].length)
  } else if (suffix) {
    meridiem = suffix[1] === 'a' ? 'am' : 'pm'
    value = value.slice(0, suffix.index)
  }

  let hour: number
  let minute = 0
  let second = 0
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  const spoken = /^(\d{1,2})\s*[點点時时](?:\s*(半)|\s*(\d{1,2})\s*分?)?$/.exec(value)
  if (clock) {
    hour = Number(clock[1])
    minute = Number(clock[2])
    second = Number(clock[3] ?? 0)
  } else if (spoken) {
    hour = Number(spoken[1])
    minute = spoken[2] ? 30 : Number(spoken[3] ?? 0)
  } else if (meridiem && /^\d{1,2}$/.test(value)) {
    hour = Number(value)
  } else {
    return undefined
  }

  if (meridiem === 'am' && hour === 12) hour = 0
  else if (meridiem === 'pm' && hour < 12) hour += 12
  if (hour > 23 || minute > 59 || second > 59) return undefined
  return `${pad2(hour)}:${pad2(minute)}`
}

const STATUS_WORDS = new Map<string, PostStatus>([
  ['草稿', 'draft'],
  ['draft', 'draft'],
  ['已確認', 'confirmed'],
  ['確認', 'confirmed'],
  ['confirmed', 'confirmed'],
  ['已排程', 'confirmed'],
  ['待發佈', 'confirmed'],
  ['待發布', 'confirmed'],
  ['已發佈', 'published'],
  ['已發布', 'published'],
  ['發佈', 'published'],
  ['發布', 'published'],
  ['published', 'published'],
  ['已發文', 'published']
])

/** Unknown or empty values become a draft. */
export function parseStatus(text: string): PostStatus {
  return STATUS_WORDS.get(text.normalize('NFKC').trim().toLowerCase()) ?? 'draft'
}

/** Splits "Facebook、IG / LINE" style lists; repeats are dropped regardless of case. */
export function splitPlatformNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of text.normalize('NFKC').split(/[,、;/|\r\n]/)) {
    const name = part.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function rowRecord(headers: string[], row: TableRow): Record<string, string> {
  return Object.fromEntries(headers.map((header, i) => [header, row.cells[i] ?? '']))
}

export function previewImport(file: string): ImportPreview {
  const table = toTable(readRows(file))
  return {
    headers: table.headers,
    sampleRows: table.rows.slice(0, SAMPLE_ROWS).map((row) => rowRecord(table.headers, row)),
    totalRows: table.rows.length,
    suggestedMapping: suggestMapping(table.headers)
  }
}

/**
 * Creates one post per row. Rows that cannot be read are reported and left out; rows whose title and date match
 * an existing post are skipped. Platforms must already exist; unknown names are reported instead of created.
 * All rows are written in one transaction, so an unexpected failure leaves the project unchanged.
 */
export function importFile(file: string, mapping: ColumnMapping): ImportResult {
  if (!mapping.title) throw new Error('請選擇標題欄位')
  const table = toTable(readRows(file))
  const columnOf = (header: string | undefined): number => {
    if (!header) return -1
    const index = table.headers.indexOf(header)
    if (index < 0) throw new Error(`找不到欄位「${header}」，請重新選擇檔案`)
    return index
  }
  const columns = {
    title: columnOf(mapping.title),
    content: columnOf(mapping.content),
    date: columnOf(mapping.date),
    time: columnOf(mapping.time),
    platforms: columnOf(mapping.platforms),
    status: columnOf(mapping.status)
  }
  const cell = (row: TableRow, index: number): string => (index < 0 ? '' : (row.cells[index] ?? ''))

  const platformIdByName = new Map<string, string | null>()
  const unknownPlatforms = new Map<string, string>()
  const platformIds = (names: string[]): string[] => {
    const ids: string[] = []
    for (const name of names) {
      const key = name.toLowerCase()
      let id = platformIdByName.get(key)
      if (id === undefined) {
        id = findPlatformByName(name)?.id ?? null
        platformIdByName.set(key, id)
      }
      if (id) ids.push(id)
      else if (!unknownPlatforms.has(key)) unknownPlatforms.set(key, name)
    }
    return ids
  }

  let imported = 0
  let skipped = 0
  const errors: ImportRowError[] = []
  getProjectDb().transaction(() => {
    for (const row of table.rows) {
      const title = cell(row, columns.title)
      if (!title) {
        errors.push({ row: row.number, message: '標題是空的，未匯入' })
        continue
      }
      const dateText = cell(row, columns.date)
      const date = parseDateCell(dateText)
      if (!date) {
        errors.push({ row: row.number, message: `日期「${dateText}」無法辨識（請用 2026-05-08 這類格式），未匯入` })
        continue
      }
      const timeText = cell(row, columns.time)
      const time = parseTimeCell(timeText)
      if (time === undefined) {
        errors.push({ row: row.number, message: `時間「${timeText}」無法辨識（請用 09:30 這類格式），未匯入` })
        continue
      }
      if (postExists(title, date.date)) {
        skipped++
        continue
      }
      createPost({
        title,
        content_html: plainTextToHtml(cell(row, columns.content)),
        scheduled_date: date.date,
        scheduled_time: time ?? date.time,
        status: parseStatus(cell(row, columns.status)),
        platform_ids: platformIds(splitPlatformNames(cell(row, columns.platforms)))
      })
      imported++
    }
  })
  return { imported, skipped, errors, unknownPlatforms: [...unknownPlatforms.values()] }
}
