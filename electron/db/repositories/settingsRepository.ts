import { getGlobalDb } from '../connection.ts'

export function getSetting(key: string): string | undefined {
  return getGlobalDb().get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value
}

export function setSetting(key: string, value: string): void {
  getGlobalDb().run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}
