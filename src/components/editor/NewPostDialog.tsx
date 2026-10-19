import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage, reportError } from '../../lib/api.ts'
import { textToHtml } from '../../lib/html.ts'
import { usePlatformStore } from '../../stores/platformStore.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import { extractPlaceholders, fillTemplate } from '../../../shared/template.ts'
import type { PostWithPlatforms, Template } from '../../../shared/types.ts'

interface NewPostDialogProps {
  initialDate?: string
  /** Plain text to start from, for example a filled template. Hides the template picker. */
  initialText?: string
  onClose: () => void
  onCreated: (post: PostWithPlatforms) => void
}

export default function NewPostDialog({ initialDate = '', initialText, onClose, onCreated }: NewPostDialogProps) {
  const { platforms, loaded: platformsLoaded, loadPlatforms } = usePlatformStore()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState('')
  const [platformIds, setPlatformIds] = useState<string[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!platformsLoaded) void loadPlatforms()
  }, [platformsLoaded, loadPlatforms])

  useEffect(() => {
    if (initialText !== undefined) return
    api
      .getTemplates()
      .then(setTemplates)
      .catch((err: unknown) => reportError('載入範本失敗', err))
  }, [initialText])

  const template = templates.find((t) => t.id === templateId)
  const placeholders = template ? extractPlaceholders(template.content) : []
  const text = template ? fillTemplate(template.content, values) : (initialText ?? '')

  const togglePlatform = (id: string) =>
    setPlatformIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const created = await api.createPost({
        title: trimmed,
        content_html: text ? textToHtml(text) : '',
        scheduled_date: date || null,
        scheduled_time: time || null,
        status: 'draft',
        platform_ids: platformIds
      })
      void usePostStore.getState().loadPosts()
      toast.success(`已建立「${created.title}」`)
      onCreated(created)
    } catch (err) {
      toast.error(`建立貼文失敗：${errorMessage(err)}`)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal-dialog new-post-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-post-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3 id="new-post-title">新增貼文</h3>

        <div className="field-group">
          <label htmlFor="new-post-name">標題</label>
          <input
            id="new-post-name"
            type="text"
            value={title}
            maxLength={200}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：週末活動預告"
          />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label htmlFor="new-post-date">日期</label>
            <input id="new-post-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="new-post-time">時間</label>
            <input id="new-post-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        {platforms.length > 0 && (
          <fieldset className="field-group platform-checkboxes">
            <legend className="field-label">發佈平台</legend>
            {platforms.map((p) => (
              <label key={p.id} className="platform-checkbox">
                <input type="checkbox" checked={platformIds.includes(p.id)} onChange={() => togglePlatform(p.id)} />
                {p.name}
              </label>
            ))}
          </fieldset>
        )}

        {initialText === undefined && templates.length > 0 && (
          <div className="field-group">
            <label htmlFor="new-post-template">從範本開始（可不選）</label>
            <select
              id="new-post-template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value)
                setValues({})
              }}
            >
              <option value="">不使用範本</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {placeholders.map((name) => (
          <div key={name} className="field-group">
            <label htmlFor={`new-post-ph-${name}`}>{name}</label>
            <input
              id={`new-post-ph-${name}`}
              type="text"
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          </div>
        ))}

        {text && <pre className="new-post-preview">{text}</pre>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || saving}>
            {saving ? '建立中…' : '建立'}
          </button>
        </div>
      </form>
    </div>
  )
}
