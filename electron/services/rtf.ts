import { isSafeUrl, tokenizeHtml } from './html.ts'

// Converts editor HTML to RTF so pasting into Word, Outlook or WordPad keeps the formatting.
// Traditional Chinese text is written as \uN escapes, so the code page only matters for fallbacks.

const HEADER =
  '{\\rtf1\\ansi\\ansicpg950\\deff0\\uc1' +
  '{\\fonttbl{\\f0\\fswiss\\fcharset136 Microsoft JhengHei;}{\\f1\\fmodern\\fcharset0 Consolas;}}' +
  '{\\colortbl ;\\red5\\green99\\blue193;}' +
  '\\f0\\fs24\n'

const HEADING_SIZE: Record<string, number> = { h1: 36, h2: 30, h3: 26, h4: 24, h5: 24, h6: 24 }

const INLINE_GROUPS: Record<string, string> = {
  b: '{\\b ',
  strong: '{\\b ',
  i: '{\\i ',
  em: '{\\i ',
  u: '{\\ul ',
  s: '{\\strike ',
  del: '{\\strike ',
  strike: '{\\strike ',
  code: '{\\f1 '
}

const LINE_BREAK = '\\line '

/** Escapes text for RTF. Characters above ASCII become signed 16-bit \uN escapes, one per UTF-16 unit. */
export function escapeRtf(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x5c) out += '\\\\'
    else if (code === 0x7b) out += '\\{'
    else if (code === 0x7d) out += '\\}'
    else if (code === 0x09) out += '\\tab '
    else if (code === 0x0a) out += LINE_BREAK
    else if (code < 0x20) continue
    else if (code > 0x7e) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`
    else out += text[i]
  }
  return out
}

export function htmlToRtf(html: string): string {
  let body = ''
  const groups: { tag: string; close: string }[] = []
  const lists: { ordered: boolean; index: number }[] = []
  let inParagraph = false
  let lineStart = false // nothing visible written on the current line yet
  let afterMarker = false // a list marker was just written; the item's first <p> joins its line
  let quoteDepth = 0
  let pre = 0

  const indent = (): string => (quoteDepth > 0 ? `\\li${720 * quoteDepth}` : '')
  const startParagraph = (format: string): void => {
    if (inParagraph) body += '\\par\n'
    body += `\\pard${format} `
    inParagraph = true
    lineStart = true
  }
  const ensureParagraph = (): void => {
    if (!inParagraph) startParagraph(`${indent()}\\sa120`)
  }
  const endParagraph = (): void => {
    if (inParagraph) body += '\\par\n'
    inParagraph = false
  }
  const openGroup = (tag: string, open: string, close: string): void => {
    body += open
    groups.push({ tag, close })
  }
  const closeGroup = (tag: string): void => {
    const index = groups.findLastIndex((g) => g.tag === tag)
    if (index < 0) return
    while (groups.length > index) body += groups.pop()?.close ?? ''
  }

  for (const t of tokenizeHtml(html)) {
    if (t.type === 'text') {
      let text = pre > 0 ? t.text : t.text.replace(/\s+/g, ' ')
      if (!inParagraph || lineStart) {
        if (pre === 0) text = text.trimStart()
        if (!text) continue
        ensureParagraph()
      }
      lineStart = false
      afterMarker = false
      body += escapeRtf(text)
      continue
    }

    if (t.type === 'open') {
      const inline = INLINE_GROUPS[t.tag]
      if (inline) {
        if (t.tag === 'code' && pre > 0) continue
        ensureParagraph()
        openGroup(t.tag, inline, '}')
        continue
      }
      switch (t.tag) {
        case 'p':
          if (afterMarker) afterMarker = false
          else startParagraph(lists.length > 0 ? `\\li${360 * lists.length}\\sa60` : `${indent()}\\sa120`)
          break
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          startParagraph(`${indent()}\\sb200\\sa100\\keepn`)
          openGroup(t.tag, `{\\b\\fs${HEADING_SIZE[t.tag]} `, '}')
          break
        case 'blockquote':
          endParagraph()
          quoteDepth++
          break
        case 'pre':
          startParagraph(`${indent()}\\sa120`)
          openGroup('pre', '{\\f1\\fs20 ', '}')
          pre++
          break
        case 'ul':
        case 'ol': {
          endParagraph()
          const start = Number.parseInt(t.attrs.start ?? '1', 10)
          lists.push({ ordered: t.tag === 'ol', index: (Number.isFinite(start) ? start : 1) - 1 })
          break
        }
        case 'li': {
          const list = lists.at(-1)
          startParagraph(`\\li${360 * Math.max(1, lists.length)}\\fi-360\\sa60`)
          body += list?.ordered ? `${++list.index}.\\tab ` : '\\bullet\\tab '
          afterMarker = true
          break
        }
        case 'br':
          ensureParagraph()
          body += LINE_BREAK
          lineStart = true
          break
        case 'hr':
          endParagraph()
          body += '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n'
          break
        case 'a': {
          const href = t.attrs.href?.trim() ?? ''
          if (!isSafeUrl(href)) break
          ensureParagraph()
          const target = escapeRtf(href.replace(/"/g, '%22'))
          openGroup('a', `{\\field{\\*\\fldinst{HYPERLINK "${target}"}}{\\fldrslt{\\ul\\cf1 `, '}}}')
          break
        }
      }
      continue
    }

    if (INLINE_GROUPS[t.tag]) {
      if (!(t.tag === 'code' && pre > 0)) closeGroup(t.tag)
      continue
    }
    switch (t.tag) {
      case 'p':
        if (lists.length === 0) endParagraph()
        break
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        closeGroup(t.tag)
        endParagraph()
        break
      case 'blockquote':
        endParagraph()
        quoteDepth = Math.max(0, quoteDepth - 1)
        break
      case 'pre':
        // Code blocks from Markdown end with a newline; do not turn it into an empty line.
        if (body.endsWith(LINE_BREAK)) body = body.slice(0, -LINE_BREAK.length)
        closeGroup('pre')
        pre = Math.max(0, pre - 1)
        endParagraph()
        break
      case 'li':
        afterMarker = false
        endParagraph()
        break
      case 'ul':
      case 'ol':
        lists.pop()
        endParagraph()
        break
      case 'a':
        closeGroup('a')
        break
    }
  }

  while (groups.length > 0) body += groups.pop()?.close ?? ''
  endParagraph()
  return `${HEADER}${body}}`
}
