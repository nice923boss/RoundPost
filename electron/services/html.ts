// HTML helpers for post content produced by the editor or converted from Markdown.
// Pure functions only, so they run in the main process and in tests.

export type HtmlToken =
  | { type: 'text'; text: string }
  | { type: 'open'; tag: string; attrs: Record<string, string> }
  | { type: 'close'; tag: string }

export const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'wbr'])
// Elements whose content is never shown as post text.
const SKIPPED_CONTENT_TAGS = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'title', 'head'])

const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z]+));/g,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16)
      const valid = code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      return valid ? String.fromCodePoint(code) : match
    }
  )
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of source.matchAll(ATTR_RE)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}

export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = []
  const re = new RegExp(TAG_RE.source, 'g')
  let lower: string | null = null
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', text: decodeEntities(html.slice(last, m.index)) })
    last = re.lastIndex
    if (!m[2]) continue // comment, doctype or processing instruction
    const tag = m[2].toLowerCase()
    if (m[1]) {
      tokens.push({ type: 'close', tag })
      continue
    }
    if (SKIPPED_CONTENT_TAGS.has(tag)) {
      lower ??= html.toLowerCase()
      const close = lower.indexOf(`</${tag}`, last)
      const end = close < 0 ? -1 : html.indexOf('>', close)
      last = end < 0 ? html.length : end + 1
      re.lastIndex = last
      continue
    }
    tokens.push({ type: 'open', tag, attrs: parseAttrs(m[3] ?? '') })
  }
  if (last < html.length) tokens.push({ type: 'text', text: decodeEntities(html.slice(last)) })
  return tokens
}

export function isSafeUrl(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url.trim())
}

/** True when text looks like block-level HTML (editor output) rather than Markdown or plain text. */
export function looksLikeHtml(text: string): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|pre|blockquote|hr|div|br)[\s>/]/i.test(text)
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a'
])

function allowedAttrs(tag: string, attrs: Record<string, string>): string {
  if (tag === 'a' && attrs.href && isSafeUrl(attrs.href)) return ` href="${escapeHtml(attrs.href.trim())}"`
  if (tag === 'ol' && /^\d{1,6}$/.test(attrs.start ?? '')) return ` start="${attrs.start}"`
  return ''
}

/** Keeps only the formatting the editor supports; drops scripts, styles, event handlers and unsafe links. */
export function sanitizeHtml(html: string): string {
  let out = ''
  const open: string[] = []
  for (const t of tokenizeHtml(html)) {
    if (t.type === 'text') {
      out += escapeHtml(t.text)
      continue
    }
    if (!ALLOWED_TAGS.has(t.tag)) continue
    if (t.type === 'open') {
      if (VOID_TAGS.has(t.tag)) {
        out += `<${t.tag}>`
        continue
      }
      out += `<${t.tag}${allowedAttrs(t.tag, t.attrs)}>`
      open.push(t.tag)
      continue
    }
    const index = open.lastIndexOf(t.tag)
    if (index < 0) continue
    while (open.length > index) out += `</${open.pop()}>`
  }
  while (open.length > 0) out += `</${open.pop()}>`
  return out
}

/** Converts plain text (for example a spreadsheet cell) to paragraphs with line breaks. */
export function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const PARAGRAPH_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])
const LINE_TAGS = new Set(['div', 'tr', 'table', 'section', 'article'])
const HR_TEXT = '──────────'

/** Converts HTML to readable plain text: paragraphs become blank lines, lists keep bullets and numbers. */
export function htmlToPlainText(html: string): string {
  const lists: { ordered: boolean; index: number }[] = []
  const links: { href: string; start: number }[] = []
  let out = ''
  let pending = 0 // newlines owed before the next visible text
  let pre = 0
  let afterMarker = false // a list marker was just written; the item's first paragraph adds no break
  let cellsInRow = 0

  const blockBreak = (): number => (lists.length > 0 ? 1 : 2)
  const want = (n: number): void => {
    pending = Math.max(pending, n)
  }
  const write = (text: string): void => {
    if (!text) return
    if (pending > 0 && out.length > 0) out += '\n'.repeat(pending)
    pending = 0
    out += text
  }

  for (const t of tokenizeHtml(html)) {
    if (t.type === 'text') {
      if (pre > 0) {
        write(t.text)
        continue
      }
      let text = t.text.replace(/\s+/g, ' ')
      if (out.length === 0 || pending > 0 || /\s$/.test(out)) text = text.trimStart()
      if (text) afterMarker = false
      write(text)
      continue
    }

    if (t.type === 'open') {
      if (PARAGRAPH_TAGS.has(t.tag)) {
        if (afterMarker) afterMarker = false
        else want(blockBreak())
      } else if (LINE_TAGS.has(t.tag)) {
        want(1)
        if (t.tag === 'tr') cellsInRow = 0
      } else {
        switch (t.tag) {
          case 'br':
            if (pending > 0 && out.length > 0) out += '\n'.repeat(pending)
            pending = 0
            out += '\n'
            break
          case 'pre':
            want(blockBreak())
            pre++
            break
          case 'ul':
          case 'ol': {
            want(lists.length > 0 ? 1 : 2)
            const start = Number.parseInt(t.attrs.start ?? '1', 10)
            lists.push({ ordered: t.tag === 'ol', index: (Number.isFinite(start) ? start : 1) - 1 })
            break
          }
          case 'li': {
            want(1)
            const list = lists.at(-1)
            const indent = '  '.repeat(Math.max(0, lists.length - 1))
            write(indent + (list?.ordered ? `${++list.index}. ` : '• '))
            afterMarker = true
            break
          }
          case 'hr':
            want(2)
            write(HR_TEXT)
            want(2)
            break
          case 'td':
          case 'th':
            if (cellsInRow++ > 0) write('\t')
            break
          case 'a':
            links.push({ href: t.attrs.href ?? '', start: out.length })
            break
        }
      }
      continue
    }

    if (PARAGRAPH_TAGS.has(t.tag)) want(blockBreak())
    else if (LINE_TAGS.has(t.tag)) want(1)
    else if (t.tag === 'pre') {
      pre = Math.max(0, pre - 1)
      want(blockBreak())
    } else if (t.tag === 'li') {
      afterMarker = false
      want(1)
    } else if (t.tag === 'ul' || t.tag === 'ol') {
      lists.pop()
      want(lists.length > 0 ? 1 : 2)
    } else if (t.tag === 'a') {
      const link = links.pop()
      if (link && isSafeUrl(link.href)) {
        const href = link.href.trim()
        const shown = href.replace(/^mailto:/i, '')
        const text = out.slice(link.start).trim()
        if (!text) write(shown)
        else if (text !== href && text !== shown) write(` (${shown})`)
      }
    }
  }

  return out
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
