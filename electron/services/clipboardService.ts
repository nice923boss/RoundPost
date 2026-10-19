// What goes on the clipboard when a post is copied: HTML for web editors, RTF for Word and plain text for the rest.
import { htmlToPlainText, plainTextToHtml, sanitizeHtml } from './html.ts'
import { htmlToRtf } from './rtf.ts'
import type { Post } from '../../shared/types.ts'

export interface ClipboardPayload {
  html: string
  rtf: string
  text: string
}

/** content_html is the edited version; the plain text is only a fallback for posts that have no HTML. */
export function clipboardPayload(post: Pick<Post, 'content' | 'content_html'>): ClipboardPayload {
  const html = sanitizeHtml(post.content_html) || plainTextToHtml(post.content)
  return { html, rtf: htmlToRtf(html), text: htmlToPlainText(html) }
}
