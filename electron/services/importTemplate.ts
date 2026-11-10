// The downloadable import template: one sheet with the headers the importer recognises and example rows,
// and one sheet explaining each column. Built on demand so it lists the platforms the user has right now.
import fs from 'node:fs'
import { getAllPlatforms } from '../db/repositories/platformRepository.ts'
import { POST_STATUS_LABELS, POST_STATUSES } from '../../shared/types.ts'
import { XLSX_STYLE, toExcelDate, toExcelTime, writeXlsx, type XlsxCell } from './xlsxWriter.ts'

export const IMPORT_TEMPLATE_NAME = '貼文匯入範本.xlsx'

const HEADERS = ['標題', '內容', '日期', '時間', '平台', '狀態'] as const
const STATUS_COLUMN = HEADERS.indexOf('狀態')

function textCell(value: string): XlsxCell {
  return { value, style: XLSX_STYLE.text }
}

function dateCell(base: Date, daysLater: number): XlsxCell {
  const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysLater)
  return { value: toExcelDate(day.getFullYear(), day.getMonth() + 1, day.getDate()), style: XLSX_STYLE.date }
}

function timeCell(hour: number, minute: number): XlsxCell {
  return { value: toExcelTime(hour, minute), style: XLSX_STYLE.time }
}

/** Builds the template workbook. Example dates start tomorrow so they land in the visible calendar. */
export function buildImportTemplate(platformNames: string[], today = new Date()): Buffer {
  const first = platformNames.slice(0, 2).join('、')
  const single = platformNames[0] ?? ''
  const examples: XlsxCell[][] = [
    [
      textCell('【範例】新品上市預告'),
      textCell('內容可以直接換行。\n第二行文字\n#hashtag 也可以寫在這裡'),
      dateCell(today, 1),
      timeCell(9, 30),
      textCell(first),
      textCell(POST_STATUS_LABELS.draft)
    ],
    [
      textCell('【範例】週末活動提醒'),
      textCell('同一篇要發到多個平台時，平台欄用「、」或逗號分隔。'),
      dateCell(today, 3),
      timeCell(20, 0),
      textCell(single),
      textCell(POST_STATUS_LABELS.confirmed)
    ],
    [
      textCell('【範例】還沒決定日期的草稿'),
      textCell('日期留空會變成未排程的草稿，之後再拖到行事曆上。'),
      { value: '', style: XLSX_STYLE.date },
      { value: '', style: XLSX_STYLE.time },
      textCell(''),
      textCell(POST_STATUS_LABELS.draft)
    ]
  ]

  const platformList = platformNames.length > 0 ? platformNames.join('、') : '（目前沒有平台，請先到「平台管理」新增）'
  const statusList = POST_STATUSES.map((s) => POST_STATUS_LABELS[s]).join('、')
  const guide: [string, string, string][] = [
    ['標題', '必填', '每列一篇貼文。標題與日期都和既有貼文相同時會略過，不會重複建立。'],
    ['內容', '選填', '貼文內文，可在儲存格內換行（Alt + Enter）。'],
    ['日期', '選填', '例如 2026-05-08、2026/5/8 或民國 115/5/8。留空會成為未排程草稿。'],
    ['時間', '選填', '例如 09:30、21:00、下午 3:30。留空表示不指定時間。'],
    ['平台', '選填', `必須是平台管理裡已有的名稱，多個用「、」或逗號分隔。目前的平台：${platformList}`],
    ['狀態', '選填', `${statusList}。留空或無法辨識時當作草稿。`]
  ]
  const notes = [
    '匯入前請刪除標題開頭是「【範例】」的範例列，否則會一起匯入。',
    '第一列是欄位名稱，請勿修改；不需要的欄位可以整欄刪除。',
    '匯入只讀取第一個工作表（貼文），這張說明不會被匯入。',
    '也可以另存成 CSV 再匯入，欄位名稱相同即可。'
  ]

  return writeXlsx([
    {
      name: '貼文',
      freezeHeader: true,
      columns: [
        { width: 28, style: XLSX_STYLE.text },
        { width: 48, style: XLSX_STYLE.text },
        { width: 13, style: XLSX_STYLE.date },
        { width: 9, style: XLSX_STYLE.time },
        { width: 22, style: XLSX_STYLE.text },
        { width: 10, style: XLSX_STYLE.text }
      ],
      rows: [HEADERS.map((h) => ({ value: h, style: XLSX_STYLE.header })), ...examples],
      validations: [
        {
          column: STATUS_COLUMN,
          options: POST_STATUSES.map((s) => POST_STATUS_LABELS[s]),
          message: `狀態請填：${statusList}`
        }
      ]
    },
    {
      name: '填寫說明',
      columns: [{ width: 10 }, { width: 8 }, { width: 80, style: XLSX_STYLE.text }],
      rows: [
        ['欄位', '必填', '說明'].map((h) => ({ value: h, style: XLSX_STYLE.header })),
        ...guide.map(([name, required, text]) => [name, required, textCell(text)]),
        [],
        [{ value: '注意事項', style: XLSX_STYLE.header }],
        // Plain cells, so long notes spill over the empty cells to their right instead of wrapping.
        ...notes.map((note) => [`・${note}`])
      ]
    }
  ])
}

/** Writes the template with the current platform names. */
export function saveImportTemplate(file: string): void {
  const data = buildImportTemplate(getAllPlatforms().map((p) => p.name))
  try {
    fs.writeFileSync(file, data)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM') throw new Error('檔案正被其他程式開啟（例如 Excel），請先關閉後再試')
    throw err
  }
}
