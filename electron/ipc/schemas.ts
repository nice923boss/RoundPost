// Argument schemas for the IPC channels. Free of electron imports so the tests can load it.
import { z } from 'zod'
import { POST_STATUSES, THEMES } from '../../shared/types.ts'

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function isRealDate(value: string): boolean {
  const [y = 0, m = 0, d = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export const Id = z.string().min(1).max(100)

export const DateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式必須是 YYYY-MM-DD')
  .refine(isRealDate, '日期不存在')

export const TimeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時間格式必須是 HH:mm')

export const Status = z.enum(POST_STATUSES)

export const ThemeName = z.enum(THEMES)

const Title = z.string().trim().min(1, '請輸入標題').max(500, '標題最多 500 字')
const Html = z.string().max(2_000_000, '內容太長')

export const CreatePost = z.strictObject({
  title: Title,
  content_html: Html.optional(),
  scheduled_date: DateText.nullable().optional(),
  scheduled_time: TimeText.nullable().optional(),
  status: Status.optional(),
  platform_ids: z.array(Id).max(100).optional()
})

export const UpdatePost = z.strictObject({
  title: Title.optional(),
  content_html: Html.optional(),
  scheduled_date: DateText.nullable().optional(),
  scheduled_time: TimeText.nullable().optional(),
  status: Status.optional()
})

export const PostFilters = z
  .strictObject({
    date_from: DateText.optional(),
    date_to: DateText.optional(),
    status: Status.optional(),
    platform_id: Id.optional()
  })
  .optional()

export const SearchQuery = z.string().max(500, '搜尋文字最多 500 字')

export const PlatformInput = z.strictObject({
  name: z.string().trim().min(1, '請輸入平台名稱').max(100, '平台名稱最多 100 字'),
  url: z
    .string()
    .trim()
    .max(2000, '網址太長')
    .refine((value) => value === '' || isHttpUrl(value), '網址必須以 http:// 或 https:// 開頭')
    .optional(),
  notes: z.string().max(2000, '備註最多 2000 字').optional(),
  icon: z.string().trim().max(32, '圖示太長').optional()
})

export const PlatformChanges = PlatformInput.partial()

export const TemplateInput = z.strictObject({
  name: z.string().trim().min(1, '請輸入範本名稱').max(200, '範本名稱最多 200 字'),
  content: z.string().max(200_000, '範本內容太長')
})

export const TemplateChanges = TemplateInput.partial()

export const ProjectName = z.string().trim().min(1, '請輸入專案名稱').max(100, '專案名稱最多 100 字')

const ColumnName = z.string().max(200)

export const ColumnMapping = z.strictObject({
  title: z.string().min(1, '請選擇標題欄位').max(200),
  content: ColumnName.optional(),
  date: ColumnName.optional(),
  time: ColumnName.optional(),
  platforms: ColumnName.optional(),
  status: ColumnName.optional()
})

export const LogText = z.string().max(10_000)
