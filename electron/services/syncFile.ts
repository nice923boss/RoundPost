// Reads the Markdown files that the HoloTeam post preparer writes into <sync folder>/sync/.
// A file is a YAML frontmatter block followed by the post text in Markdown.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { decodeText } from './textDecode.ts'
import { markdownToHtml } from './markdown.ts'
import { upsertSyncedPost } from '../db/repositories/postRepository.ts'
import type { SyncEvent } from '../../shared/types.ts'

export interface ParsedSyncFile {
  title: string
  content_html: string
  scheduled_date: string | null
  scheduled_time: string | null
  /** Lower-case status written in the file, if any */
  file_status: string | null
  platform_names: string[]
  source_skill: string | null
  /** Problems that did not stop the file from being read */
  warnings: string[]
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function splitFrontmatter(text: string): { yaml: string; body: string } {
  const lines = text.replace(/^﻿/, '').split(/\r\n?|\n/)
  if (lines[0]?.trimEnd() !== '---') throw new Error('檔案開頭缺少 frontmatter（--- 區塊）')
  const end = lines.findIndex((line, index) => index > 0 && (line.trimEnd() === '---' || line.trimEnd() === '...'))
  if (end < 0) throw new Error('frontmatter 缺少結尾的 --- 行')
  return { yaml: lines.slice(1, end).join('\n'), body: lines.slice(end + 1).join('\n') }
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === ''
}

/** YYYY-MM-DD, or undefined when the value is not a real calendar date. */
function normalizeDate(value: unknown): string | undefined {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(value).trim())
  if (!match) return undefined
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** HH:mm, or undefined when the value is not a valid time of day. */
function normalizeTime(value: unknown): string | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim())
  if (!match) return undefined
  const [hour, minute, second] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  if (hour > 23 || minute > 59 || second > 59) return undefined
  return `${pad2(hour)}:${pad2(minute)}`
}

function toNames(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，、]/) : []
  const names = items
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map((item) => String(item).trim())
    .filter(Boolean)
  return [...new Set(names)]
}

/** Throws an Error with a message for the user when the file cannot be used at all. */
export function parseSyncFile(text: string): ParsedSyncFile {
  const { yaml, body } = splitFrontmatter(text)
  let data: unknown
  try {
    // YAML 1.2: unquoted values such as 2026-05-08 and 09:00 stay strings.
    data = yaml.trim() === '' ? {} : parse(yaml, { logLevel: 'error' })
  } catch (err) {
    throw new Error(`frontmatter 無法解析：${err instanceof Error ? err.message : String(err)}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter 格式錯誤（應為 key: value）')
  }
  const fields = data as Record<string, unknown>

  const title = isBlank(fields.title) ? '' : String(fields.title).trim()
  if (!title) throw new Error('缺少標題（title）')

  const warnings: string[] = []
  let scheduledDate: string | null = null
  if (!isBlank(fields.date)) {
    scheduledDate = normalizeDate(fields.date) ?? null
    if (scheduledDate === null) warnings.push(`日期「${String(fields.date)}」無法辨識，已設為未排程`)
  }
  let scheduledTime: string | null = null
  if (!isBlank(fields.time)) {
    scheduledTime = normalizeTime(fields.time) ?? null
    if (scheduledTime === null) warnings.push(`時間「${String(fields.time)}」無法辨識，已清除`)
  }

  return {
    title,
    content_html: markdownToHtml(body.trim()),
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    file_status: typeof fields.status === 'string' && fields.status.trim() ? fields.status.trim().toLowerCase() : null,
    platform_names: toNames(fields.platforms),
    source_skill: typeof fields.source_skill === 'string' && fields.source_skill.trim() ? fields.source_skill.trim() : null,
    warnings
  }
}

/** Reads one file of the sync folder and stores it as a post. Never throws; problems come back as an error event. */
export function processSyncFile(folder: string, file: string): SyncEvent {
  const rel = path.relative(folder, file).replaceAll('\\', '/')
  const at = new Date().toISOString()
  try {
    const bytes = fs.readFileSync(file)
    const parsed = parseSyncFile(decodeText(bytes))
    const { action } = upsertSyncedPost({
      sync_source: rel,
      sync_hash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      source_skill: parsed.source_skill,
      title: parsed.title,
      content_html: parsed.content_html,
      scheduled_date: parsed.scheduled_date,
      scheduled_time: parsed.scheduled_time,
      file_status: parsed.file_status,
      platform_names: parsed.platform_names
    })
    return parsed.warnings.length > 0 ? { file: rel, action, message: parsed.warnings.join('；'), at } : { file: rel, action, at }
  } catch (err) {
    return { file: rel, action: 'error', message: err instanceof Error ? err.message : String(err), at }
  }
}
