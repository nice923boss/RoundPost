import { clipboard, ClipboardItem, shell } from 'electron'
import { z } from 'zod'
import { handle } from './handle.ts'
import { Id, isHttpUrl } from './schemas.ts'
import { getPostById } from '../db/repositories/postRepository.ts'
import { getPlatformById } from '../db/repositories/platformRepository.ts'
import { clipboardPayload } from '../services/clipboardService.ts'

export function registerClipboardHandlers(): void {
  handle('clipboard:copy', z.tuple([Id]), async ([postId]) => {
    const post = getPostById(postId)
    if (!post) throw new Error('找不到貼文')
    const { html, rtf, text } = clipboardPayload(post)
    // Electron 44 writes text/rtf as the Windows "Rich Text Format" that Word reads.
    await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html, 'text/rtf': rtf })])
  })

  handle('shell:openUrl', z.tuple([Id]), async ([platformId]) => {
    const platform = getPlatformById(platformId)
    if (!platform) throw new Error('找不到平台')
    if (!platform.url) throw new Error('此平台沒有設定網址')
    if (!isHttpUrl(platform.url)) throw new Error('網址必須以 http:// 或 https:// 開頭')
    await shell.openExternal(platform.url)
  })
}
