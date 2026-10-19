import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../lib/api.ts'
import { formatSchedule } from '../../lib/date.ts'
import { flushEdits } from '../../stores/editorGuard.ts'
import { usePlatformStore } from '../../stores/platformStore.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import PostDetailPanel from '../editor/PostDetailPanel.tsx'
import {
  POST_STATUSES,
  POST_STATUS_LABELS,
  type PostFilters,
  type PostStatus,
  type PostWithPlatforms
} from '../../../shared/types.ts'

const PREVIEW_LENGTH = 120

export default function SearchPanel() {
  const { platforms, loaded: platformsLoaded, loadPlatforms } = usePlatformStore()
  const posts = usePostStore((s) => s.posts)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<PostStatus | ''>('')
  const [platformId, setPlatformId] = useState('')
  const [results, setResults] = useState<PostWithPlatforms[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!platformsLoaded) void loadPlatforms()
  }, [platformsLoaded, loadPlatforms])

  const runSearch = async () => {
    const filters: PostFilters = {}
    if (status) filters.status = status
    if (platformId) filters.platform_id = platformId
    setSearching(true)
    try {
      setResults(await api.searchPosts(query.trim(), filters))
    } catch (err) {
      toast.error(`搜尋失敗：${errorMessage(err)}`)
    } finally {
      setSearching(false)
    }
  }

  // Results follow edits made in the panel (or elsewhere) without searching again.
  useEffect(() => {
    const latest = new Map(posts.map((p) => [p.id, p]))
    setResults((current) => current?.flatMap((p) => latest.get(p.id) ?? []) ?? null)
  }, [posts])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void runSearch()
  }

  const select = async (id: string) => {
    if (id === selectedId) return
    if (await flushEdits()) setSelectedId(id)
  }

  return (
    <div className="page-split">
      <div className="search-panel page-split-main">
        <div className="page-header">
          <h2>🔍 搜尋</h2>
        </div>

        <form className="search-bar" role="search" onSubmit={handleSubmit}>
          <input
            type="search"
            value={query}
            maxLength={500}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋標題或內容，多個關鍵字用空白分開"
            aria-label="搜尋文字"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as PostStatus | '')} aria-label="狀態篩選">
            <option value="">全部狀態</option>
            {POST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {POST_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {platforms.length > 0 && (
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} aria-label="平台篩選">
              <option value="">全部平台</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? '搜尋中…' : '搜尋'}
          </button>
        </form>
        <p className="hint">關鍵字留空會列出符合篩選條件的全部貼文。</p>

        <div className="search-results" aria-live="polite">
          {results !== null && (
            <p className="muted">{results.length === 0 ? '找不到符合的貼文' : `找到 ${results.length} 篇`}</p>
          )}
          {results?.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`search-result-item ${post.id === selectedId ? 'selected' : ''}`}
              onClick={() => void select(post.id)}
            >
              <span className="search-result-title">
                {post.title || '（無標題）'}
                <span className={`badge badge-${post.status}`}>{POST_STATUS_LABELS[post.status]}</span>
              </span>
              <span className="search-result-meta">
                {formatSchedule(post.scheduled_date, post.scheduled_time)}
                {post.platforms.length > 0 && `，${post.platforms.map((pp) => pp.platform_name).join('、')}`}
              </span>
              {post.content && (
                <span className="search-result-preview">
                  {post.content.slice(0, PREVIEW_LENGTH)}
                  {post.content.length > PREVIEW_LENGTH ? '…' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {selectedId && (
        <PostDetailPanel
          key={selectedId}
          postId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            setSelectedId(null)
            setResults((current) => current?.filter((p) => p.id !== selectedId) ?? null)
          }}
        />
      )}
    </div>
  )
}
