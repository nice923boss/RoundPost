// Template placeholders use {{name}}. Names may be in any language, for example {{客戶名}}.
// Shared by the renderer (preview and filling) and the main process.

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g

/** Placeholder names in order of first appearance, without duplicates. */
export function extractPlaceholders(content: string): string[] {
  return [...new Set(Array.from(content.matchAll(PLACEHOLDER), (m) => m[1]))]
}

/** Replaces placeholders that have a value; unknown ones stay as written. Values are inserted literally. */
export function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(PLACEHOLDER, (whole, name: string) => (Object.hasOwn(values, name) ? values[name] : whole))
}
