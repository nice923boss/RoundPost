import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { api, errorMessage, reportError } from '../../lib/api.ts'
import { formatTimestamp } from '../../lib/date.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { registerFlush } from '../../stores/editorGuard.ts'
import { usePlatformStore } from '../../stores/platformStore.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import PlatformRow from './PlatformRow.tsx'
import {
  POST_STATUSES,
  POST_STATUS_LABELS,
  type PostPlatform,
  type PostStatus,
  type PostWithPlatforms
} from '../../../shared/types.ts'

interface PostDetailPanelProps {
  postId: string
  onClose: () => void
  /** Called after the post was deleted; defaults to onClose. */
  onDeleted?: () => void
}

interface Fields {
  title: string
  date: string
  time: string
  status: PostStatus
}

interface ToolbarItem {
  label: ReactNode
  title: string
  mark: string
  attrs?: Record<string, unknown>
  toggle: (editor: Editor) => boolean
}

const TOOLBAR: ToolbarItem[] = [
  { label: <strong>B</strong>, title: '粗體（Ctrl+B）', mark: 'bold', toggle: (e) => e.chain().focus().toggleBold().run() },
  { label: <em>I</em>, title: '斜體（Ctrl+I）', mark: 'italic', toggle: (e) => e.chain().focus().toggleItalic().run() },
  {
    label: 'H2',
    title: '小標題',
    mark: 'heading',
    attrs: { level: 2 },
    toggle: (e) => e.chain().focus().toggleHeading({ level: 2 }).run()
  },
  { label: '•', title: '項目清單', mark: 'bulletList', toggle: (e) => e.chain().focus().toggleBulletList().run() },
  { label: '1.', title: '編號清單', mark: 'orderedList', toggle: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: '</>', title: '程式碼區塊', mark: 'codeBlock', toggle: (e) => e.chain().focus().toggleCodeBlock().run() }
]

const EMPTY_FIELDS: Fields = { title: '', date: '', time: '', status: 'draft' }

function fieldsOf(post: PostWithPlatforms): Fields {
  return { title: post.title, date: post.scheduled_date ?? '', time: post.scheduled_time ?? '', status: post.status }
}

function normalizeHref(raw: string): string {
  return /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}`
}

export default function PostDetailPanel({ postId, onClose, onDeleted }: PostDetailPanelProps) {
  const { platforms, loaded: platformsLoaded, loadPlatforms } = usePlatformStore()
  const syncRevision = usePostStore((s) => s.syncRevision)
  const [post, setPost] = useState<PostWithPlatforms | null>(null)
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS)
  const [titleError, setTitleError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState<string | null>(null)

  // Refs hold the latest values for saves that run outside a render (flush, unmount).
  const fieldsRef = useRef<Fields>(EMPTY_FIELDS)
  const htmlRef = useRef('')
  const editCount = useRef(0)
  const savedEditCount = useRef(0)
  const onCloseRef = useRef(onClose)
  const seenRevision = useRef(syncRevision)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  const isDirty = () => editCount.current !== savedEditCount.current

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: '輸入貼文內容…' })
    ],
    content: '',
    onUpdate: ({ editor: e }) => {
      htmlRef.current = e.getHTML()
      editCount.current += 1
    }
  })

  const showFields = (next: Fields) => {
    fieldsRef.current = next
    setFields(next)
  }

  const changeField = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    showFields({ ...fieldsRef.current, [key]: value })
    editCount.current += 1
    if (key === 'title') setTitleError('')
  }

  const load = useCallback(async () => {
    if (!editor) return
    try {
      const loaded = await api.getPost(postId)
      if (editor.isDestroyed) return
      if (!loaded) {
        toast.error('找不到這篇貼文，可能已被刪除')
        onCloseRef.current()
        return
      }
      setPost(loaded)
      showFields(fieldsOf(loaded))
      setTitleError('')
      editor.commands.setContent(loaded.content_html || '')
      htmlRef.current = editor.getHTML()
      savedEditCount.current = editCount.current
    } catch (err) {
      reportError('載入貼文失敗', err)
      toast.error(`無法載入貼文：${errorMessage(err)}`)
    }
  }, [editor, postId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!platformsLoaded) void loadPlatforms()
  }, [platformsLoaded, loadPlatforms])

  // Files in the sync folder changed: reload a synced post unless that would discard the user's edits.
  useEffect(() => {
    if (syncRevision === seenRevision.current) return
    seenRevision.current = syncRevision
    if (!post?.sync_source) return
    if (isDirty()) {
      toast.info('同步資料夾有更新，但這篇貼文有未儲存的修改，所以沒有自動重新載入')
      return
    }
    void load()
  }, [syncRevision, post?.sync_source, load])

  const save = useCallback(async (): Promise<boolean> => {
    if (!editor) return false
    const current = fieldsRef.current
    const title = current.title.trim()
    if (!title) {
      setTitleError('請輸入標題')
      toast.error('請輸入標題後再儲存')
      return false
    }
    const editsAtStart = editCount.current
    setSaving(true)
    try {
      const updated = await api.updatePost(postId, {
        title,
        content_html: editor.getHTML(),
        scheduled_date: current.date || null,
        scheduled_time: current.time || null,
        status: current.status
      })
      setPost(updated)
      savedEditCount.current = editsAtStart
      // The editor content is left alone so the cursor does not jump; fields typed during the save are kept.
      if (editCount.current === editsAtStart) showFields(fieldsOf(updated))
      void usePostStore.getState().loadPosts()
      toast.success('已儲存')
      return true
    } catch (err) {
      reportError('儲存貼文失敗', err)
      toast.error(`儲存失敗：${errorMessage(err)}`)
      return false
    } finally {
      setSaving(false)
    }
  }, [editor, postId])

  const saveIfDirty = useCallback(() => (isDirty() ? save() : Promise.resolve(true)), [save])

  useEffect(() => registerFlush(saveIfDirty), [saveIfDirty])

  // Leaving the page through the sidebar unmounts the panel; unsaved edits are saved on the way out.
  useEffect(
    () => () => {
      if (!isDirty()) return
      const { title, date, time, status } = fieldsRef.current
      if (!title.trim()) return
      savedEditCount.current = editCount.current
      api
        .updatePost(postId, {
          title: title.trim(),
          content_html: htmlRef.current,
          scheduled_date: date || null,
          scheduled_time: time || null,
          status
        })
        .then(() => {
          toast.success('已自動儲存未儲存的修改')
          void usePostStore.getState().loadPosts()
        })
        .catch((err: unknown) => {
          reportError('自動儲存貼文失敗', err)
          toast.error(`自動儲存失敗：${errorMessage(err)}`)
        })
    },
    [postId]
  )

  const handleClose = async () => {
    if (await saveIfDirty()) onClose()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void save()
    }
  }

  const runPlatformAction = async (action: () => Promise<PostWithPlatforms>, failure: string) => {
    setBusy(true)
    try {
      const updated = await action()
      setPost((prev) => (prev ? { ...prev, platforms: updated.platforms } : updated))
      void usePostStore.getState().loadPosts()
    } catch (err) {
      toast.error(`${failure}：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async (pp: PostPlatform) => {
    // The copy is made from the saved post, so pending edits are saved first.
    if (!(await saveIfDirty())) return
    setBusy(true)
    try {
      await api.copyPost(postId)
      setCopiedId(pp.id)
      window.setTimeout(() => setCopiedId((id) => (id === pp.id ? null : id)), 2000)
      toast.success('已複製，可直接貼到平台')
    } catch (err) {
      toast.error(`複製失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleOpen = (pp: PostPlatform) => {
    api.openPlatformUrl(pp.platform_id).catch((err: unknown) => toast.error(`無法開啟網址：${errorMessage(err)}`))
  }

  const handleRemove = async (pp: PostPlatform) => {
    if (pp.published) {
      const ok = await confirmAction({
        title: `移除平台「${pp.platform_name}」`,
        message: '這個平台已標記為已發佈，移除後發佈紀錄也會一併刪除。',
        confirmLabel: '移除',
        danger: true
      })
      if (!ok) return
    }
    await runPlatformAction(() => api.removePlatformFromPost(postId, pp.platform_id), '移除平台失敗')
  }

  const handleMarkPublished = () => {
    changeField('status', 'published')
    void save()
  }

  const openLinkInput = () => {
    if (!editor) return
    const href: unknown = editor.getAttributes('link').href
    setLinkDraft(typeof href === 'string' ? href : '')
  }

  const closeLinkInput = () => {
    setLinkDraft(null)
    editor?.commands.focus()
  }

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkDraft(null)
  }

  const applyLink = (e: FormEvent) => {
    e.preventDefault()
    if (!editor) return
    const raw = (linkDraft ?? '').trim()
    if (!raw) {
      removeLink()
      return
    }
    const href = normalizeHref(raw)
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setLinkDraft(null)
  }

  const handleDelete = async () => {
    if (!post) return
    const syncNote = post.sync_source
      ? `\n此貼文來自同步檔 ${post.sync_source}，若同步資料夾裡的檔案還在，下次啟動或檔案變更時會重新建立。`
      : ''
    const ok = await confirmAction({
      title: '刪除貼文',
      message: `確定要刪除「${post.title || '（無標題）'}」嗎？此操作無法復原。${syncNote}`,
      confirmLabel: '刪除',
      danger: true
    })
    if (!ok) return
    try {
      await api.deletePost(postId)
      savedEditCount.current = editCount.current
      void usePostStore.getState().loadPosts()
      toast.success('已刪除貼文')
      ;(onDeleted ?? onClose)()
    } catch (err) {
      toast.error(`刪除失敗：${errorMessage(err)}`)
    }
  }

  const header = (
    <div className="panel-header">
      <h3>貼文詳情</h3>
      <div className="panel-actions">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !post} title="儲存（Ctrl+S）">
          {saving ? '儲存中…' : '💾 儲存'}
        </button>
        <button type="button" className="btn-icon" onClick={() => void handleClose()} title="關閉" aria-label="關閉貼文詳情">
          ✕
        </button>
      </div>
    </div>
  )

  if (!post) {
    return (
      <aside className="post-detail-panel" aria-label="貼文詳情">
        {header}
        <div className="panel-body">
          <div className="empty-message page-loading">載入中…</div>
        </div>
      </aside>
    )
  }

  const assigned = new Set(post.platforms.map((pp) => pp.platform_id))
  const unassigned = platforms.filter((p) => !assigned.has(p.id))
  const openable = new Set(platforms.filter((p) => p.url.trim()).map((p) => p.id))
  const allPublished = post.platforms.length > 0 && post.platforms.every((pp) => pp.published)

  return (
    <aside className="post-detail-panel" aria-label="貼文詳情" onKeyDown={handleKeyDown}>
      {header}

      <div className="panel-body">
        {post.sync_source && (
          <div className="sync-badge" title={post.sync_source}>
            同步自 {post.sync_source}：檔案更新時會覆蓋此處的修改
          </div>
        )}

        <div className="field-group">
          <label htmlFor="post-title">標題</label>
          <input
            id="post-title"
            type="text"
            value={fields.title}
            maxLength={200}
            onChange={(e) => changeField('title', e.target.value)}
            placeholder="輸入標題…"
            className="post-title-input"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? 'post-title-error' : undefined}
          />
          {titleError && (
            <div id="post-title-error" className="field-error">
              {titleError}
            </div>
          )}
        </div>

        <div className="field-row">
          <div className="field-group">
            <label htmlFor="post-date">日期</label>
            <input id="post-date" type="date" value={fields.date} onChange={(e) => changeField('date', e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="post-time">時間</label>
            <input id="post-time" type="time" value={fields.time} onChange={(e) => changeField('time', e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="post-status">狀態</label>
            <select
              id="post-status"
              value={fields.status}
              onChange={(e) => changeField('status', e.target.value as PostStatus)}
            >
              {POST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {POST_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">內容</span>
          <div className="editor-toolbar" role="toolbar" aria-label="文字格式">
            {TOOLBAR.map((item) => {
              const active = editor?.isActive(item.mark, item.attrs) ?? false
              return (
                <button
                  key={item.mark}
                  type="button"
                  className={`toolbar-btn ${active ? 'active' : ''}`}
                  onClick={() => editor && item.toggle(editor)}
                  title={item.title}
                  aria-label={item.title}
                  aria-pressed={active}
                >
                  {item.label}
                </button>
              )
            })}
            <button
              type="button"
              className={`toolbar-btn ${editor?.isActive('link') ? 'active' : ''}`}
              onClick={openLinkInput}
              title="插入或編輯連結"
              aria-label="插入或編輯連結"
            >
              🔗
            </button>
          </div>
          {linkDraft !== null && (
            <form className="link-input-row" onSubmit={applyLink}>
              <input
                type="text"
                value={linkDraft}
                autoFocus
                placeholder="https://example.com"
                aria-label="連結網址"
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    closeLinkInput()
                  }
                }}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                套用
              </button>
              {editor?.isActive('link') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={removeLink}>
                  移除連結
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeLinkInput}>
                取消
              </button>
            </form>
          )}
          <EditorContent editor={editor} className="tiptap-editor" />
        </div>

        <div className="field-group">
          <span className="field-label">發佈平台</span>
          {post.platforms.length === 0 && <p className="hint">尚未指定平台，可從下方選單加入。</p>}
          <div className="platform-list">
            {post.platforms.map((pp) => (
              <PlatformRow
                key={pp.id}
                postPlatform={pp}
                canOpen={openable.has(pp.platform_id)}
                copied={copiedId === pp.id}
                busy={busy}
                onCopy={() => void handleCopy(pp)}
                onOpen={() => handleOpen(pp)}
                onTogglePublished={() => void runPlatformAction(() => api.togglePublished(pp.id), '切換發佈狀態失敗')}
                onRemove={() => void handleRemove(pp)}
              />
            ))}
          </div>
          {allPublished && fields.status !== 'published' && (
            <div className="publish-hint">
              <span>全部平台都已發佈。</span>
              <button type="button" className="btn btn-success btn-sm" onClick={handleMarkPublished} disabled={saving}>
                將狀態改為已發佈
              </button>
            </div>
          )}
          {unassigned.length > 0 && (
            <div className="add-platform">
              <select
                value=""
                disabled={busy}
                aria-label="新增平台"
                onChange={(e) => {
                  const platformId = e.target.value
                  if (platformId) void runPlatformAction(() => api.addPlatformToPost(postId, platformId), '新增平台失敗')
                }}
              >
                <option value="" disabled>
                  ＋ 新增平台…
                </option>
                {unassigned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="panel-footer">
          <span className="panel-meta">最後更新 {formatTimestamp(post.updated_at)}</span>
          <button type="button" className="btn btn-danger" onClick={() => void handleDelete()}>
            🗑️ 刪除此貼文
          </button>
        </div>
      </div>
    </aside>
  )
}
