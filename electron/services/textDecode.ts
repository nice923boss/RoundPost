// Decodes user text files such as CSV exports.
// A byte order mark decides the encoding; without one, valid UTF-8 wins and anything else is read as
// Big5, because Excel on Traditional Chinese Windows saves "CSV" files in code page 950.
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  try {
    // The decoder removes a UTF-8 BOM by itself.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('big5').decode(bytes)
  }
}
