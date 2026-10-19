// Posts store local calendar dates (YYYY-MM-DD). toISOString() would give the UTC date, which is
// yesterday's date in Taiwan before 08:00, so every date here is built from local time.

const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return localDate(new Date(year, month - 1, day + days))
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** "10/18（六）09:00", or "未排程" when the post has no date. */
export function formatSchedule(date: string | null, time: string | null): string {
  if (!date) return '未排程'
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()]
  const label = `${month}/${day}（${weekday}）`
  return time ? `${label} ${time}` : label
}

/** Formats a stored timestamp (ISO or SQLite "YYYY-MM-DD HH:MM:SS" in UTC) as local date and time. */
export function formatTimestamp(value: string | null): string {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  return `${localDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
