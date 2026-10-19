import { formatTimestamp } from '../../lib/date.ts'
import type { PostPlatform } from '../../../shared/types.ts'

interface PlatformRowProps {
  postPlatform: PostPlatform
  /** False when the platform was deleted or has no URL set. */
  canOpen: boolean
  copied: boolean
  busy: boolean
  onCopy: () => void
  onOpen: () => void
  onTogglePublished: () => void
  onRemove: () => void
}

export default function PlatformRow({
  postPlatform,
  canOpen,
  copied,
  busy,
  onCopy,
  onOpen,
  onTogglePublished,
  onRemove
}: PlatformRowProps) {
  const { platform_name: name, published, published_at: publishedAt } = postPlatform

  return (
    <div className={`platform-row ${published ? 'published' : ''}`}>
      <div className="platform-info">
        <span className="platform-name">{name}</span>
        {published && publishedAt && <span className="published-time">發佈於 {formatTimestamp(publishedAt)}</span>}
      </div>
      <div className="platform-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCopy} disabled={busy} title="複製貼文內容（保留格式）">
          {copied ? '✅ 已複製' : '📋 複製'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpen}
          disabled={!canOpen}
          title={canOpen ? '用瀏覽器開啟平台網址' : '此平台沒有設定網址，可到平台管理設定'}
        >
          🔗 前往
        </button>
        <button
          type="button"
          className={`btn btn-sm ${published ? 'btn-success' : 'btn-secondary'}`}
          onClick={onTogglePublished}
          disabled={busy}
          aria-pressed={published}
          title={published ? '改回未發佈' : '標記為已發佈'}
        >
          {published ? '✅ 已發佈' : '⬜ 未發佈'}
        </button>
        <button
          type="button"
          className="btn-icon btn-sm"
          onClick={onRemove}
          disabled={busy}
          title="從這篇貼文移除此平台"
          aria-label={`移除平台 ${name}`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
