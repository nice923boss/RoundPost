import { create } from 'zustand'
import { api, errorMessage, reportError } from '../lib/api.ts'
import { toast } from './toastStore.ts'
import type { PostWithPlatforms, SyncEvent } from '../../shared/types.ts'

interface PostState {
  /** Every post of the open project; pages filter on their own. */
  posts: PostWithPlatforms[]
  loaded: boolean
  /** Goes up after the sync folder changed posts, so open editors know to reload. */
  syncRevision: number
  loadPosts: () => Promise<void>
  reset: () => void
}

export const usePostStore = create<PostState>((set) => ({
  posts: [],
  loaded: false,
  syncRevision: 0,
  loadPosts: async () => {
    try {
      set({ posts: await api.getPosts(), loaded: true })
    } catch (err) {
      set({ loaded: true })
      reportError('載入貼文失敗', err)
      toast.error(`載入貼文失敗：${errorMessage(err)}`)
    }
  },
  reset: () => set({ posts: [], loaded: false })
}))

// A folder full of changed files arrives as a burst of events; they are reported as one message.
const SYNC_BATCH_MS = 800

/** Listens for sync folder events until the returned function is called. */
export function startSyncListener(): () => void {
  let pending: SyncEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    const events = pending
    pending = []
    const changed = events.filter((e) => e.action === 'created' || e.action === 'updated' || e.action === 'removed')
    const errors = events.filter((e) => e.action === 'error')
    if (changed.length > 0) {
      usePostStore.setState((state) => ({ syncRevision: state.syncRevision + 1 }))
      void usePostStore.getState().loadPosts()
      toast.info(`已同步 ${changed.length} 個檔案`)
    }
    for (const e of errors.slice(0, 3)) toast.error(`同步失敗：${e.file}${e.message ? `，${e.message}` : ''}`)
    if (errors.length > 3) toast.error(`另有 ${errors.length - 3} 個檔案同步失敗，詳見記錄檔`)
  }

  const stop = api.onSyncEvent((event) => {
    pending.push(event)
    if (!timer) timer = setTimeout(flush, SYNC_BATCH_MS)
  })

  return () => {
    if (timer) clearTimeout(timer)
    stop()
  }
}
