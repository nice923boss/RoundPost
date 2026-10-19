// Reads the first visible worksheet of an .xlsx file as rows of text, without third-party packages.
// An .xlsx file is a ZIP archive of XML parts; only the parts that hold cell values are read.
// Old binary .xls files are not supported. Free of electron imports so it can be tested.
import path from 'node:path'
import zlib from 'node:zlib'
import { decodeEntities } from './html.ts'

const MAX_PART_BYTES = 100 * 1024 * 1024
const MAX_COLUMNS = 1024
const MAX_ROWS = 1_048_576
/** Serial number of 10000-01-01; larger numbers are not dates. */
const MAX_DATE_SERIAL = 2_958_466

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
const LOCAL_HEADER = 0x04034b50
/** First bytes of an OLE compound file: an .xls file or a password-protected workbook. */
const COMPOUND_FILE = 0xd0cf11e0

// Number formats 14-22 and 45-47 are dates and times; 27-36 and 50-58 are the East Asian date formats.
const BUILT_IN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58
])

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

// ---------------------------------------------------------------- ZIP

interface ZipEntry {
  flags: number
  method: number
  crc: number
  compressedSize: number
  size: number
  offset: number
}

function damaged(): Error {
  return new Error('不是有效的 .xlsx 檔（檔案結構損壞）')
}

function tooLarge(): Error {
  return new Error('檔案解壓縮後超過 100MB，請分批匯入')
}

function readZipDirectory(bytes: Buffer): Map<string, ZipEntry> {
  let end = -1
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 22 - 0xffff); pos--) {
    if (bytes.readUInt32LE(pos) === END_OF_DIRECTORY) {
      end = pos
      break
    }
  }
  if (end < 0) throw new Error('不是有效的 .xlsx 檔（找不到 ZIP 目錄）')
  const count = bytes.readUInt16LE(end + 10)
  let pos = bytes.readUInt32LE(end + 16)
  if (count === 0xffff || pos === 0xffffffff) throw new Error('不支援 ZIP64 格式的 .xlsx 檔')

  const entries = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== DIRECTORY_ENTRY) throw damaged()
    const nameLength = bytes.readUInt16LE(pos + 28)
    const name = bytes.toString('utf8', pos + 46, pos + 46 + nameLength)
    // Part names are case-insensitive in Office files.
    entries.set(name.replace(/^\/+/, '').toLowerCase(), {
      flags: bytes.readUInt16LE(pos + 8),
      method: bytes.readUInt16LE(pos + 10),
      crc: bytes.readUInt32LE(pos + 16),
      compressedSize: bytes.readUInt32LE(pos + 20),
      size: bytes.readUInt32LE(pos + 24),
      offset: bytes.readUInt32LE(pos + 42)
    })
    pos += 46 + nameLength + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32)
  }
  return entries
}

function extract(bytes: Buffer, entry: ZipEntry): Buffer {
  if (entry.flags & 1) throw new Error('不支援加密的 .xlsx 檔')
  if (entry.size === 0xffffffff || entry.compressedSize === 0xffffffff || entry.offset === 0xffffffff) {
    throw new Error('不支援 ZIP64 格式的 .xlsx 檔')
  }
  if (entry.size > MAX_PART_BYTES) throw tooLarge()
  const header = entry.offset
  if (header + 30 > bytes.length || bytes.readUInt32LE(header) !== LOCAL_HEADER) throw damaged()
  const start = header + 30 + bytes.readUInt16LE(header + 26) + bytes.readUInt16LE(header + 28)
  if (start + entry.compressedSize > bytes.length) throw damaged()
  const stored = bytes.subarray(start, start + entry.compressedSize)

  let data: Buffer
  if (entry.method === 0) {
    data = stored
  } else if (entry.method === 8) {
    try {
      // The limit stops a small file from expanding into gigabytes.
      data = zlib.inflateRawSync(stored, { maxOutputLength: MAX_PART_BYTES })
    } catch (err) {
      if ((err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw tooLarge()
      throw new Error('xlsx 檔內容損壞，無法解壓縮', { cause: err })
    }
  } else {
    throw new Error(`不支援的 ZIP 壓縮方式（代號 ${entry.method}）`)
  }
  if (zlib.crc32(data) !== entry.crc) throw new Error('xlsx 檔內容損壞（CRC 檢查不符）')
  return data
}

/** Returns the text of a part of the archive, or undefined when the part is missing. */
type PartReader = (name: string) => string | undefined

function openPackage(bytes: Buffer): PartReader {
  const entries = readZipDirectory(bytes)
  return (name) => {
    const entry = entries.get(name.toLowerCase())
    return entry ? extract(bytes, entry).toString('utf8').replace(/^﻿/, '') : undefined
  }
}

// ---------------------------------------------------------------- XML

type Attributes = Record<string, string>

interface XmlHandler {
  open?(name: string, attrs: Attributes): void
  close?(name: string): void
  text?(text: string): void
}

// One token per match: comment, CDATA section, processing instruction, declaration, tag, text, or a stray '<'.
const XML_TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<![^>]*>?|<(\/?)([^\s/>!?]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|[^<]+|</g
const XML_ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** Drops the namespace prefix, so x:row reads as row and r:id as id. */
function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1)
}

/** Calls the handler for each element and text run; a self-closing element gets open and close. */
function scanXml(xml: string, handler: XmlHandler): void {
  for (const match of xml.matchAll(XML_TOKEN)) {
    const token = match[0]
    if (token[0] !== '<') {
      handler.text?.(decodeEntities(token))
    } else if (match[1] !== undefined) {
      handler.text?.(match[1])
    } else if (match[3] !== undefined) {
      const name = localName(match[3])
      if (match[2]) {
        handler.close?.(name)
        continue
      }
      const attrs: Attributes = {}
      for (const attr of match[4].matchAll(XML_ATTRIBUTE)) attrs[localName(attr[1])] = decodeEntities(attr[2] ?? attr[3])
      handler.open?.(name, attrs)
      if (match[5]) handler.close?.(name)
    }
  }
}

/** Office writes characters that XML cannot hold, such as a carriage return, as _xHHHH_. */
function unescapeOoxml(text: string): string {
  if (!text.includes('_x')) return text
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}

// ---------------------------------------------------------------- Workbook parts

interface Relationship {
  type: string
  /** Name of the part the relationship points to */
  target: string
}

/** Relationships of a part (of the package itself when part is ''), by id. */
function readRelationships(readPart: PartReader, part: string): Map<string, Relationship> {
  const folder = path.posix.dirname(part)
  const xml = readPart(path.posix.join(folder, '_rels', `${path.posix.basename(part)}.rels`))
  const relationships = new Map<string, Relationship>()
  if (xml === undefined) return relationships
  scanXml(xml, {
    open(name, attrs) {
      if (name !== 'Relationship' || !attrs.Id || !attrs.Target || attrs.TargetMode === 'External') return
      const target = attrs.Target.startsWith('/') ? attrs.Target.slice(1) : path.posix.join(folder, attrs.Target)
      relationships.set(attrs.Id, { type: attrs.Type ?? '', target: path.posix.normalize(target) })
    }
  })
  return relationships
}

function findTarget(relationships: Map<string, Relationship>, type: string): string | undefined {
  for (const relationship of relationships.values()) {
    if (relationship.type.endsWith(`/${type}`)) return relationship.target
  }
  return undefined
}

interface SheetEntry {
  relationshipId: string
  hidden: boolean
}

function readWorkbook(xml: string): { date1904: boolean; sheets: SheetEntry[] } {
  let date1904 = false
  const sheets: SheetEntry[] = []
  scanXml(xml, {
    open(name, attrs) {
      if (name === 'workbookPr') {
        date1904 = attrs.date1904 === '1' || attrs.date1904 === 'true'
      } else if (name === 'sheet' && attrs.id) {
        sheets.push({ relationshipId: attrs.id, hidden: attrs.state === 'hidden' || attrs.state === 'veryHidden' })
      }
    }
  })
  return { date1904, sheets }
}

function readSharedStrings(xml: string | undefined): string[] {
  const strings: string[] = []
  if (xml === undefined) return strings
  let current = ''
  let inItem = false
  let inText = false
  // Phonetic guides (rPh) hold furigana and similar readings, not cell text.
  let phonetic = 0
  scanXml(xml, {
    open(name) {
      if (name === 'si') {
        inItem = true
        current = ''
      } else if (name === 'rPh') {
        phonetic++
      } else if (name === 't') {
        inText = inItem && phonetic === 0
      }
    },
    close(name) {
      if (name === 'si') {
        strings.push(unescapeOoxml(current))
        inItem = false
      } else if (name === 'rPh') {
        phonetic--
      } else if (name === 't') {
        inText = false
      }
    },
    text(text) {
      if (inText) current += text
    }
  })
  return strings
}

/** True when a number format shows dates or times. */
function isDateFormat(code: string): boolean {
  // Ignore literal text, [colour] and [locale] sections, and escaped, padding and fill characters.
  const tokens = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[\\_*]./g, '')
  return /[ymdhs]/i.test(tokens)
}

/** For each cell style, whether its number format is a date or time format. */
function readDateStyles(xml: string | undefined): boolean[] {
  if (xml === undefined) return []
  const customFormats = new Map<number, string>()
  const formatIds: number[] = []
  let inCellFormats = false
  scanXml(xml, {
    open(name, attrs) {
      if (name === 'numFmt') customFormats.set(Number(attrs.numFmtId), attrs.formatCode ?? '')
      else if (name === 'cellXfs') inCellFormats = true
      else if (name === 'xf' && inCellFormats) formatIds.push(Number(attrs.numFmtId ?? 0))
    },
    close(name) {
      if (name === 'cellXfs') inCellFormats = false
    }
  })
  return formatIds.map((id) => {
    const custom = customFormats.get(id)
    return custom === undefined ? BUILT_IN_DATE_FORMATS.has(id) : isDateFormat(custom)
  })
}

// ---------------------------------------------------------------- Cells

/**
 * Converts a spreadsheet date number to text: HH:mm for a time of day (below 1), YYYY-MM-DD for a date,
 * YYYY-MM-DD HH:mm when both are set. Day 0 is 1899-12-30, or 1904-01-01 in the 1904 date system.
 */
export function excelSerialToText(serial: number, date1904 = false): string {
  const days = date1904 ? serial + 1462 : serial
  // 25569 is the serial number of 1970-01-01. Rounded to whole seconds to drop floating point noise.
  const date = new Date(Math.round((days - 25569) * 86400) * 1000)
  const time = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`
  if (serial < 1) return time
  const day = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
  return time === '00:00' ? day : `${day} ${time}`
}

/** Cells of type d hold an ISO 8601 date. */
function isoDateText(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value.trim())
  if (!match) return value
  return match[2] && match[2] !== '00:00' ? `${match[1]} ${match[2]}` : match[1]
}

interface SheetContext {
  strings: string[]
  dateStyles: boolean[]
  date1904: boolean
}

function cellText(type: string, raw: string, isDate: boolean, context: SheetContext): string {
  if (raw === '') return ''
  switch (type) {
    case 's':
      return context.strings[Number(raw)] ?? ''
    case 'str':
    case 'inlineStr':
      return unescapeOoxml(raw)
    case 'b':
      return raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : raw
    case 'e':
      return raw
    case 'd':
      return isoDateText(raw)
    default: {
      if (raw.trim() === '') return ''
      const number = Number(raw)
      if (!Number.isFinite(number)) return raw
      if (isDate && number >= 0 && number < MAX_DATE_SERIAL) return excelSerialToText(number, context.date1904)
      // 15 significant digits, as Excel shows them: 0.1 + 0.2 is stored as 0.30000000000000004.
      return String(Number(number.toPrecision(15)))
    }
  }
}

/** Zero-based column of a cell reference such as AB12; the next column when the reference is missing. */
function columnIndex(ref: string | undefined, previous: number): number {
  const letters = ref ? /^[A-Za-z]{1,3}/.exec(ref)?.[0] : undefined
  if (!letters) return previous + 1
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

function readSheet(xml: string, context: SheetContext): string[][] {
  const rows: string[][] = []
  let rowIndex = -1
  let row: string[] = []
  let column = -1
  let inCell = false
  let cellType = 'n'
  let cellStyle = 0
  let value = ''
  let capture = false
  let inlineDepth = 0
  let phonetic = 0

  scanXml(xml, {
    open(name, attrs) {
      switch (name) {
        case 'row': {
          const number = attrs.r ? Number(attrs.r) : rowIndex + 2
          if (!Number.isInteger(number) || number < 1 || number > MAX_ROWS) throw new Error('不是有效的 .xlsx 檔（列號超出範圍）')
          rowIndex = number - 1
          row = []
          column = -1
          break
        }
        case 'c':
          inCell = true
          column = columnIndex(attrs.r, column)
          cellType = attrs.t ?? 'n'
          cellStyle = Number(attrs.s ?? 0)
          value = ''
          break
        case 'v':
          capture = inCell && inlineDepth === 0
          break
        case 'is':
          inlineDepth++
          break
        case 'rPh':
          phonetic++
          break
        case 't':
          capture = inCell && inlineDepth > 0 && phonetic === 0
          break
      }
    },
    close(name) {
      switch (name) {
        case 'v':
        case 't':
          capture = false
          break
        case 'is':
          inlineDepth--
          break
        case 'rPh':
          phonetic--
          break
        case 'c': {
          if (!inCell) break
          inCell = false
          const text = cellText(cellType, value, context.dateStyles[cellStyle] === true, context)
          if (text === '') break
          if (column >= MAX_COLUMNS) throw new Error(`工作表超過 ${MAX_COLUMNS} 欄，請只保留需要匯入的欄位`)
          row[column] = text
          break
        }
        case 'row':
          // Only rows with values are kept; empty cells inside a row become ''.
          if (row.length > 0) rows[rowIndex] = Array.from(row, (cell) => cell ?? '')
          break
      }
    },
    text(text) {
      if (capture) value += text
    }
  })
  return Array.from(rows, (cells) => cells ?? [])
}

/**
 * Rows of the first visible worksheet. Row 1 of the sheet is at index 0; empty rows are kept as [] so that
 * row numbers match the sheet. Dates and times come back as YYYY-MM-DD, HH:mm or YYYY-MM-DD HH:mm.
 */
export function readXlsx(bytes: Buffer): string[][] {
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === COMPOUND_FILE) {
    throw new Error('這是舊版 .xls 或設有密碼的 Excel 檔，請在 Excel 另存為 .xlsx（不設密碼）後再匯入')
  }
  const readPart = openPackage(bytes)
  const workbookPath = findTarget(readRelationships(readPart, ''), 'officeDocument') ?? 'xl/workbook.xml'
  const workbookXml = readPart(workbookPath)
  if (workbookXml === undefined) throw new Error('不是有效的 .xlsx 檔（找不到活頁簿）')
  const relationships = readRelationships(readPart, workbookPath)
  const workbook = readWorkbook(workbookXml)

  // Chart sheets are listed with the worksheets; only worksheets hold cells.
  const worksheets = workbook.sheets.flatMap((sheet) => {
    const relationship = relationships.get(sheet.relationshipId)
    return relationship?.type.endsWith('/worksheet') ? [{ hidden: sheet.hidden, path: relationship.target }] : []
  })
  const sheet = worksheets.find((entry) => !entry.hidden) ?? worksheets[0]
  const sheetXml = sheet ? readPart(sheet.path) : undefined
  if (sheetXml === undefined) throw new Error('活頁簿裡沒有工作表')

  const sharedStringsPath = findTarget(relationships, 'sharedStrings')
  const stylesPath = findTarget(relationships, 'styles')
  return readSheet(sheetXml, {
    strings: readSharedStrings(sharedStringsPath ? readPart(sharedStringsPath) : undefined),
    dateStyles: readDateStyles(stylesPath ? readPart(stylesPath) : undefined),
    date1904: workbook.date1904
  })
}
