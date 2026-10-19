import { Marked } from 'marked'
import { sanitizeHtml } from './html.ts'

// Social posts rely on single line breaks, so GFM "breaks" mode keeps them as <br>.
const marked = new Marked({ gfm: true, breaks: true })

/** Converts Markdown (for example sync files from 發文準備師) to sanitized HTML. */
export function markdownToHtml(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown.replace(/\r\n?/g, '\n'), { async: false }))
}
