import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { api, errorMessage, reportError } from '../../lib/api.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { registerFlush } from '../../stores/editorGuard.ts'
import { toast } from '../../stores/toastStore.ts'
import NewPostDialog from '../editor/NewPostDialog.tsx'
import { extractPlaceholders, fillTemplate } from '../../../shared/template.ts'
import type { Template } from '../../../shared/types.ts'

interface Draft {
  /** null while creating a new template. */
  id: string | null
  name: string
  content: string
}

const PLACEHOLDER_EXAMPLE = '例：\n親愛的 {{客戶名}}，\n\n感謝您參加 {{活動名稱}}！\n\n#{{主題標籤}}'

export default function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [draftText, setDraftText] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await api.getTemplates())
    } catch (err) {
      reportError('載入範本失敗', err)
      toast.error(`載入範本失敗：${errorMessage(err)}`)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const saved = draft?.id ? templates.find((t) => t.id === draft.id) : undefined
  const dirty = draft !== null && (draft.name !== (saved?.name ?? '') || draft.content !== (saved?.content ?? ''))

  /** Asks before throwing away unsaved changes. */
  const leaveDraft = async () =>
    !dirty ||
    confirmAction({
      title: '放棄未儲存的修改？',
      message: '這個範本有未儲存的修改，切換後修改會遺失。',
      confirmLabel: '放棄修改',
      danger: true
    })

  const open = async (next: Draft) => {
    if (next.id !== null && next.id === draft?.id) return
    if (!(await leaveDraft())) return
    setDraft(next)
    setValues({})
  }

  const handleSave = async (): Promise<boolean> => {
    if (!draft) return true
    const name = draft.name.trim()
    if (!name) {
      toast.error('請輸入範本名稱')
      return false
    }
    setSaving(true)
    try {
      const result = draft.id
        ? await api.updateTemplate(draft.id, { name, content: draft.content })
        : await api.createTemplate({ name, content: draft.content })
      await loadTemplates()
      setDraft({ id: result.id, name: result.name, content: result.content })
      toast.success(draft.id ? '已儲存範本' : `已建立範本「${result.name}」`)
      return true
    } catch (err) {
      toast.error(`儲存範本失敗：${errorMessage(err)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  // Closing the window or switching projects saves the open template first, like the post editor.
  useEffect(() => (dirty ? registerFlush(handleSave) : undefined))

  const handleDelete = async () => {
    if (!draft?.id) return
    const ok = await confirmAction({
      title: `刪除範本「${draft.name || '（未命名）'}」`,
      message: '刪除後無法復原，已用這個範本建立的貼文不受影響。',
      confirmLabel: '刪除範本',
      danger: true
    })
    if (!ok) return
    try {
      await api.deleteTemplate(draft.id)
      setDraft(null)
      await loadTemplates()
      toast.success('已刪除範本')
    } catch (err) {
      toast.error(`刪除範本失敗：${errorMessage(err)}`)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void handleSave()
    }
  }

  const placeholders = draft ? extractPlaceholders(draft.content) : []
  const result = draft ? fillTemplate(draft.content, values) : ''
  const missing = placeholders.filter((p) => !values[p]?.trim())

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(result)
      toast.success('已複製套用結果')
    } catch (err) {
      toast.error(`複製失敗：${errorMessage(err)}`)
    }
  }

  return (
    <div className="template-manager">
      <div className="page-header">
        <h2>📝 範本管理</h2>
        <button type="button" className="btn btn-primary" onClick={() => void open({ id: null, name: '', content: '' })}>
          ＋ 新增範本
        </button>
      </div>

      <div className="template-layout">
        <div className="template-list" role="list">
          {loaded && templates.length === 0 && <p className="empty-message">尚無範本，點「新增範本」開始</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              className={`template-list-item ${draft?.id === t.id ? 'active' : ''}`}
              onClick={() => void open({ id: t.id, name: t.name, content: t.content })}
            >
              <span className="template-list-name">{t.name}</span>
              <span className="template-list-preview">
                {t.content.slice(0, 60)}
                {t.content.length > 60 ? '…' : ''}
              </span>
            </button>
          ))}
        </div>

        <div className="template-editor" onKeyDown={handleKeyDown}>
          {draft ? (
            <>
              <div className="field-group">
                <label htmlFor="template-name">範本名稱</label>
                <input
                  id="template-name"
                  value={draft.name}
                  maxLength={200}
                  autoFocus={draft.id === null}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="輸入範本名稱"
                />
              </div>

              <div className="field-group">
                <label htmlFor="template-content">範本內容（用 {'{{變數名}}'} 標出要替換的地方）</label>
                <textarea
                  id="template-content"
                  className="template-textarea"
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder={PLACEHOLDER_EXAMPLE}
                  rows={10}
                />
              </div>

              <div className="template-actions">
                <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving} title="儲存（Ctrl+S）">
                  {saving ? '儲存中…' : draft.id ? '儲存' : '建立'}
                </button>
                {draft.id && (
                  <button type="button" className="btn btn-danger" onClick={() => void handleDelete()}>
                    刪除
                  </button>
                )}
                {dirty && <span className="muted">有未儲存的修改</span>}
              </div>

              {draft.content.trim() && (
                <div className="template-apply-section">
                  <h4>套用範本</h4>
                  {placeholders.length > 0 ? (
                    <p className="template-apply-hint">填入變數值，下方會即時顯示結果。</p>
                  ) : (
                    <p className="template-apply-hint">這個範本沒有變數，可直接複製或建立草稿。</p>
                  )}
                  {placeholders.map((p) => (
                    <div className="field-group" key={p}>
                      <label htmlFor={`template-var-${p}`}>{`{{${p}}}`}</label>
                      <input
                        id={`template-var-${p}`}
                        value={values[p] ?? ''}
                        onChange={(e) => setValues({ ...values, [p]: e.target.value })}
                        placeholder={`輸入「${p}」的值`}
                      />
                    </div>
                  ))}

                  <div className="template-result">
                    <span className="field-label">套用結果</span>
                    <pre className="template-result-content">{result}</pre>
                    {missing.length > 0 && <p className="hint">尚未填寫：{missing.join('、')}</p>}
                    <div className="template-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => void copyResult()}>
                        📋 複製結果
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setDraftText(result)}>
                        ＋ 用結果建立草稿
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="template-empty-state">
              <p>選擇一個範本進行編輯，或建立新範本</p>
            </div>
          )}
        </div>
      </div>

      {draftText !== null && (
        <NewPostDialog
          initialText={draftText}
          onClose={() => setDraftText(null)}
          onCreated={() => {
            setDraftText(null)
            toast.info('草稿已加入，可在儀表板的「尚未排程」或行事曆找到')
          }}
        />
      )}
    </div>
  )
}
