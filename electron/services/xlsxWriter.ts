// Writes a small .xlsx workbook without third-party packages: inline strings, a fixed set of cell styles,
// column widths, a frozen header row and list validations. Free of electron imports so it can be tested.
import zlib from 'node:zlib'

/** Cell styles every workbook from this writer has. */
export const XLSX_STYLE = { normal: 0, header: 1, text: 2, date: 3, time: 4 } as const
type StyleId = (typeof XLSX_STYLE)[keyof typeof XLSX_STYLE]

/** A string is a text cell; a number with the date or time style is a spreadsheet date number. */
export type XlsxCell = string | { value: string | number; style: StyleId }

export interface XlsxColumn {
  width: number
  /** Style of cells the user types into this column later. */
  style?: StyleId
}

export interface XlsxValidation {
  /** Zero-based column; the rule covers every row below the header. */
  column: number
  options: string[]
  /** Shown as a warning that the user may dismiss. */
  message: string
}

export interface XlsxSheet {
  name: string
  columns: XlsxColumn[]
  rows: XlsxCell[][]
  /** Keeps the first row visible while scrolling. */
  freezeHeader?: boolean
  validations?: XlsxValidation[]
}

const MAX_ROW = 1_048_576
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** Days from 1899-12-30, the spreadsheet day zero, to the given calendar date. */
export function toExcelDate(year: number, month: number, day: number): number {
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** Fraction of a day, as spreadsheets store a time of day. */
export function toExcelTime(hour: number, minute: number): number {
  return (hour * 60 + minute) / 1440
}

function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Control characters other than tab and line feed are not allowed in XML; Office writes them as _xHHHH_.
      .replace(/[\x00-\x08\x0b-\x1f]/g, (c) => `_x${c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}_`)
  )
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

function cellXml(cell: XlsxCell, ref: string): string {
  const { value, style } = typeof cell === 'string' ? { value: cell, style: XLSX_STYLE.normal } : cell
  const s = style === XLSX_STYLE.normal ? '' : ` s="${style}"`
  if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`
  if (value === '') return style === XLSX_STYLE.normal ? '' : `<c r="${ref}"${s}/>`
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function sheetXml(sheet: XlsxSheet, selected: boolean): string {
  const pane = sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''
  const cols = sheet.columns
    .map((col, i) => {
      const style = col.style === undefined ? '' : ` style="${col.style}"`
      return `<col min="${i + 1}" max="${i + 1}" width="${col.width}"${style} customWidth="1"/>`
    })
    .join('')
  const rows = sheet.rows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`)).join('')}</row>`)
    .join('')
  const validations = sheet.validations ?? []
  const validationXml =
    validations.length === 0
      ? ''
      : `<dataValidations count="${validations.length}">${validations
          .map((v) => {
            const col = columnName(v.column)
            const list = escapeXml(`"${v.options.join(',')}"`)
            return `<dataValidation type="list" errorStyle="warning" allowBlank="1" showErrorMessage="1" error="${escapeXml(v.message)}" sqref="${col}2:${col}${MAX_ROW}"><formula1>${list}</formula1></dataValidation>`
          })
          .join('')}</dataValidations>`
  return (
    `${XML_HEAD}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16.5"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>${validationXml}` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
  )
}

// Index order must match XLSX_STYLE.
const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Microsoft JhengHei"/><family val="2"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>' +
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

function packageParts(sheets: XlsxSheet[]): { name: string; xml: string }[] {
  const sheetNames = sheets.map((_, i) => `xl/worksheets/sheet${i + 1}.xml`)
  const stylesId = `rId${sheets.length + 1}`
  const contentTypes =
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheetNames
      .map((name) => `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('') +
    '</Types>'
  const rootRels =
    `${XML_HEAD}<Relationships xmlns="${NS_PACKAGE_REL}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook =
    `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
    sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>'
  const workbookRels =
    `${XML_HEAD}<Relationships xmlns="${NS_PACKAGE_REL}">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="${stylesId}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`
  return [
    { name: '[Content_Types].xml', xml: contentTypes },
    { name: '_rels/.rels', xml: rootRels },
    { name: 'xl/workbook.xml', xml: workbook },
    { name: 'xl/_rels/workbook.xml.rels', xml: workbookRels },
    { name: 'xl/styles.xml', xml: STYLES_XML },
    ...sheets.map((sheet, i) => ({ name: sheetNames[i], xml: sheetXml(sheet, i === 0) }))
  ]
}

// 1980-01-01 00:00 in MS-DOS format, so the same content always gives the same bytes.
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1

/** Packs the files into a ZIP archive with deflate compression. */
function zip(files: { name: string; data: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const compressed = zlib.deflateRawSync(file.data)
    const crc = zlib.crc32(file.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, compressed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(DOS_TIME, 12)
    entry.writeUInt16LE(DOS_DATE, 14)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(compressed.length, 20)
    entry.writeUInt32LE(file.data.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    directory.push(entry, name)

    offset += local.length + name.length + compressed.length
  }
  const directoryBytes = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directoryBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, directoryBytes, end])
}

/** The first sheet is the one that opens, and the one the importer reads. */
export function writeXlsx(sheets: XlsxSheet[]): Buffer {
  if (sheets.length === 0) throw new Error('活頁簿至少要有一個工作表')
  return zip(packageParts(sheets).map((part) => ({ name: part.name, data: Buffer.from(part.xml, 'utf8') })))
}
