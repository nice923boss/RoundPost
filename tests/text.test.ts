import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeText } from '../electron/services/textDecode.ts'
import { escapeHtml, htmlToPlainText, isSafeUrl, looksLikeHtml, plainTextToHtml, sanitizeHtml } from '../electron/services/html.ts'
import { escapeRtf, htmlToRtf } from '../electron/services/rtf.ts'
import { markdownToHtml } from '../electron/services/markdown.ts'
import { clipboardPayload } from '../electron/services/clipboardService.ts'
import { extractPlaceholders, fillTemplate } from '../shared/template.ts'

test('decodeText follows the byte order mark', () => {
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('標題,日期', 'utf16le')])
  assert.equal(decodeText(le), '標題,日期')
  const be = Buffer.from('標題,日期', 'utf16le').swap16()
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), '標題,日期')
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('標題', 'utf8')])), '標題')
})

test('decodeText reads Big5 when the bytes are not UTF-8', () => {
  // 中文 in code page 950, as Excel on Traditional Chinese Windows saves CSV files.
  assert.equal(decodeText(Buffer.from([0xa4, 0xa4, 0xa4, 0xe5])), '中文')
  assert.equal(decodeText(Buffer.from('中文', 'utf8')), '中文')
})

test('sanitizeHtml keeps editor formatting and drops anything unsafe', () => {
  assert.equal(
    sanitizeHtml('<p onclick="steal()">你好<script>alert(1)</script><strong>粗</strong></p><img src=x onerror=alert(1)>'),
    '<p>你好<strong>粗</strong></p>'
  )
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>')
  assert.equal(sanitizeHtml('<a href="https://example.com/?a=1&amp;b=2" target="_blank">x</a>'), '<a href="https://example.com/?a=1&amp;b=2">x</a>')
  assert.equal(sanitizeHtml('<p>未關閉<em>斜體'), '<p>未關閉<em>斜體</em></p>')
  assert.equal(sanitizeHtml('1 < 2 & 3'), '1 &lt; 2 &amp; 3')
})

test('isSafeUrl and looksLikeHtml', () => {
  assert.equal(isSafeUrl(' https://a.tw'), true)
  assert.equal(isSafeUrl('mailto:a@b.tw'), true)
  assert.equal(isSafeUrl('javascript:x'), false)
  assert.equal(isSafeUrl('data:text/html,x'), false)
  assert.equal(looksLikeHtml('<p>x</p>'), true)
  assert.equal(looksLikeHtml('**Markdown**'), false)
})

test('htmlToPlainText keeps paragraphs, lists and links readable', () => {
  assert.equal(htmlToPlainText('<p>第一段</p><p>第二段<br>換行</p>'), '第一段\n\n第二段\n換行')
  assert.equal(htmlToPlainText('<ul><li><p>甲</p></li><li>乙</li></ul>'), '• 甲\n• 乙')
  assert.equal(htmlToPlainText('<ol start="3"><li>三</li><li>四</li></ol>'), '3. 三\n4. 四')
  assert.equal(htmlToPlainText('<p><a href="https://a.tw">報名</a></p>'), '報名 (https://a.tw)')
  assert.equal(htmlToPlainText('<p>A&amp;B&nbsp;C</p>'), 'A&B C')
  assert.equal(htmlToPlainText(''), '')
})

test('plainTextToHtml and escapeHtml', () => {
  assert.equal(plainTextToHtml('第一行\r\n第二行\n\n<第二段>'), '<p>第一行<br>第二行</p><p>&lt;第二段&gt;</p>')
  assert.equal(plainTextToHtml('  '), '')
  assert.equal(escapeHtml('"a" & <b>'), '&quot;a&quot; &amp; &lt;b&gt;')
})

test('markdownToHtml keeps single line breaks and removes raw scripts', () => {
  const html = markdownToHtml('**重點**\n第二行\n\n<script>alert(1)</script>')
  assert.match(html, /<strong>重點<\/strong><br>/)
  assert.doesNotMatch(html, /script|alert/)
})

test('escapeRtf writes non-ASCII text as signed \\u escapes', () => {
  assert.equal(escapeRtf('a{b}\\'), 'a\\{b\\}\\\\')
  assert.equal(escapeRtf('中'), '\\u20013?')
  assert.equal(escapeRtf('高'), '\\u-25896?')
  assert.equal(escapeRtf('😀'), '\\u-10179?\\u-8704?')
})

test('htmlToRtf produces an RTF document with formatting groups', () => {
  const rtf = htmlToRtf('<p><strong>粗</strong>和<em>斜</em></p>')
  assert.ok(rtf.startsWith('{\\rtf1'))
  assert.ok(rtf.endsWith('}'))
  assert.match(rtf, /\{\\b \\u31895\?\}/)
  assert.match(rtf, /\{\\i \\u26012\?\}/)
  let depth = 0
  for (const ch of rtf.replace(/\\[\\{}]/g, '')) {
    if (ch === '{') depth++
    if (ch === '}') depth--
    assert.ok(depth >= 0)
  }
  assert.equal(depth, 0)
})

test('clipboardPayload uses the HTML and falls back to the plain text', () => {
  const rich = clipboardPayload({ content: '舊文字', content_html: '<p>新<script>x</script>內容</p>' })
  assert.equal(rich.html, '<p>新內容</p>')
  assert.equal(rich.text, '新內容')
  assert.ok(rich.rtf.startsWith('{\\rtf1'))
  const plain = clipboardPayload({ content: '只有\n文字', content_html: '' })
  assert.equal(plain.html, '<p>只有<br>文字</p>')
  assert.equal(plain.text, '只有\n文字')
})

test('template placeholders', () => {
  const content = '{{客戶名}} 您好，{{ 日期 }} 見。{{客戶名}} {{未填}}'
  assert.deepEqual(extractPlaceholders(content), ['客戶名', '日期', '未填'])
  assert.equal(fillTemplate(content, { 客戶名: '王先生', 日期: '5/8' }), '王先生 您好，5/8 見。王先生 {{未填}}')
  assert.equal(fillTemplate('{{a}}', { a: '$& {{b}}' }), '$& {{b}}')
  assert.equal(fillTemplate('{{toString}}', {}), '{{toString}}')
})
