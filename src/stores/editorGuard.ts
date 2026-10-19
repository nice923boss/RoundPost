// The open post editor registers how to save its unsaved edits, so that switching posts or projects
// saves them first instead of throwing them away.

type Flush = () => Promise<boolean>

let current: Flush | null = null

export function registerFlush(flush: Flush): () => void {
  current = flush
  return () => {
    if (current === flush) current = null
  }
}

/** Saves the open editor if it has changes. False means saving failed and the caller should stop. */
export function flushEdits(): Promise<boolean> {
  return current ? current() : Promise.resolve(true)
}
