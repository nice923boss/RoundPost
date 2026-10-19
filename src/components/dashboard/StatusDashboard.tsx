import { useEffect, useMemo, useState } from 'react'
import { api, errorMessage } from '../../lib/api.ts'
import { addDays, formatSchedule, localDate } from '../../lib/date.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { flushEdits } from '../../stores/editorGuard.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import NewPostDialog from '../editor/NewPostDialog.tsx'
import PostDetailPanel from '../editor/PostDetailPanel.tsx'
import { POST_STATUS_LABELS, type PostWithPlatforms } from '../../../shared/types.ts'

const bySchedule = (a: PostWithPlatforms, b: PostWithPlatforms) =>
  `${a.scheduled_date ?? ''} ${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_date ?? ''} ${b.scheduled_time ?? ''}`)

function platformProgress(post: PostWithPlatforms): string {
  if (post.platforms.length === 0) return '未指定平台'
  const published = post.platforms.filter((p) => p.published).length
  return `${published}/${post.platforms.length} 平台已發佈`
}

interface PostSectionProps {
  title: string
  empty: string
  posts: PostWithPlatforms[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function PostSection({ title, empty, posts, selectedId, onSelect }: PostSectionProps) {
  return (
    <section className="dashboard-section">
      <h3>
        {title}
        <span className="section-count">{posts.length}</span>
      </h3>
      {posts.length === 0 ? (
        <p className="empty-message">{empty}</p>
      ) : (
        <div className="post-list">
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`post-list-item ${post.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(post.id)}
            >
              <span className="post-list-info">
                <span className="post-list-title">{post.title || '（無標題）'}</span>
                <span className="post-list-meta">
                  {formatSchedule(post.scheduled_date, post.scheduled_time)}，{platformProgress(post)}
                </span>
              </span>
              <span className={`badge badge-${post.status}`}>{POST_STATUS_LABELS[post.status]}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function StatusDashboard() {
  const { posts, loaded, loadPosts } = usePostStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelRevision, setPanelRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)

  useEffect(() => {
    if (!loaded) void loadPosts()
  }, [loaded, loadPosts])

  const today = localDate()
  const view = useMemo(() => {
    const weekEnd = addDays(today, 7)
    const scheduled = posts.filter((p) => p.scheduled_date).sort(bySchedule)
    return {
      draft: posts.filter((p) => p.status === 'draft').length,
      confirmed: posts.filter((p) => p.status === 'confirmed').length,
      published: posts.filter((p) => p.status === 'published').length,
      overdue: scheduled.filter((p) => p.scheduled_date! < today && p.status !== 'published'),
      today: scheduled.filter((p) => p.scheduled_date === today),
      upcoming: scheduled.filter((p) => p.scheduled_date! > today && p.scheduled_date! <= weekEnd),
      unscheduled: posts.filter((p) => !p.scheduled_date && p.status !== 'published')
    }
  }, [posts, today])
  const confirmedToday = view.today.filter((p) => p.status === 'confirmed')

  const select = async (id: string | null) => {
    if (id === selectedId) return
    if (await flushEdits()) setSelectedId(id)
  }

  const handleBatchPublish = async () => {
    const ok = await confirmAction({
      title: '標記今日貼文為已發佈',
      message: `今日有 ${confirmedToday.length} 篇「已確認」的貼文，會改為「已發佈」，所有平台也會標記為已發佈。`,
      confirmLabel: '標記為已發佈'
    })
    if (!ok || !(await flushEdits())) return
    setBatchBusy(true)
    try {
      const count = await api.markPublishedByDate(today)
      toast.success(count > 0 ? `已將 ${count} 篇貼文標記為已發佈` : '今日沒有已確認的貼文')
      await loadPosts()
      // The open panel reloads so it does not keep showing the old status.
      setPanelRevision((n) => n + 1)
    } catch (err) {
      toast.error(`批次標記失敗：${errorMessage(err)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  const sectionProps = { selectedId, onSelect: (id: string) => void select(id) }

  return (
    <div className="page-split">
      <div className="dashboard page-split-main">
        <div className="page-header">
          <h2>儀表板</h2>
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(true)}>
              ＋ 新增貼文
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleBatchPublish()}
              disabled={batchBusy || confirmedToday.length === 0}
              title={
                confirmedToday.length === 0
                  ? '今日沒有「已確認」的貼文'
                  : '將今日「已確認」的貼文標記為「已發佈」，表示你已完成發文作業'
              }
            >
              ✅ 標記今日貼文為已發佈
            </button>
          </div>
        </div>

        {!loaded ? (
          <div className="empty-message page-loading">載入中…</div>
        ) : (
          <div className="dashboard-content">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{posts.length}</div>
                <div className="stat-label">總貼文數</div>
              </div>
              <div className="stat-card stat-draft">
                <div className="stat-value">{view.draft}</div>
                <div className="stat-label">草稿</div>
              </div>
              <div className="stat-card stat-confirmed">
                <div className="stat-value">{view.confirmed}</div>
                <div className="stat-label">已確認</div>
              </div>
              <div className="stat-card stat-published">
                <div className="stat-value">{view.published}</div>
                <div className="stat-label">已發佈</div>
              </div>
            </div>

            {view.overdue.length > 0 && (
              <PostSection title="⚠️ 已過排程日但未發佈" empty="" posts={view.overdue} {...sectionProps} />
            )}
            <PostSection
              title={`今日待辦（${formatSchedule(today, null)}）`}
              empty="今日沒有排程的貼文"
              posts={view.today}
              {...sectionProps}
            />
            <PostSection title="未來 7 天" empty="未來 7 天沒有排程的貼文" posts={view.upcoming} {...sectionProps} />
            <PostSection title="尚未排程" empty="所有未發佈的貼文都已排程" posts={view.unscheduled} {...sectionProps} />
          </div>
        )}
      </div>

      {selectedId && (
        <PostDetailPanel
          key={`${selectedId}:${panelRevision}`}
          postId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {creating && (
        <NewPostDialog
          initialDate={today}
          onClose={() => setCreating(false)}
          onCreated={(post) => {
            setCreating(false)
            void select(post.id)
          }}
        />
      )}
    </div>
  )
}
