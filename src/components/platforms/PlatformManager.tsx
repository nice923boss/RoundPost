import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../../lib/api.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { usePlatformStore } from '../../stores/platformStore.ts'
import { toast } from '../../stores/toastStore.ts'
import type { Platform, PlatformInput } from '../../../shared/types.ts'

type PlatformForm = Required<PlatformInput>

const EMPTY_FORM: PlatformForm = { name: '', url: '', notes: '', icon: '' }

export default function PlatformManager() {
  const { platforms, loaded, loadPlatforms } = usePlatformStore()
  // null: form closed; '': adding; otherwise the id being edited.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlatformForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loaded) void loadPlatforms()
  }, [loaded, loadPlatforms])

  const openForm = (platform: Platform | null) => {
    setEditingId(platform?.id ?? '')
    setForm(platform ? { name: platform.name, url: platform.url, notes: platform.notes, icon: platform.icon } : EMPTY_FORM)
    setFormError('')
  }

  const closeForm = () => {
    setEditingId(null)
    setFormError('')
  }

  const update = (key: keyof PlatformForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setFormError('')
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    const input = { name: form.name.trim(), url: form.url.trim(), notes: form.notes.trim(), icon: form.icon.trim() }
    if (!input.name) return setFormError('請輸入平台名稱')
    if (input.url && !/^https?:\/\//i.test(input.url)) return setFormError('網址必須以 http:// 或 https:// 開頭')
    setSaving(true)
    try {
      if (editingId) await api.updatePlatform(editingId, input)
      else await api.createPlatform(input)
      await loadPlatforms()
      toast.success(editingId ? `已更新「${input.name}」` : `已新增「${input.name}」`)
      closeForm()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (platform: Platform) => {
    const ok = await confirmAction({
      title: `刪除平台「${platform.name}」`,
      message: '已加入這個平台的貼文會保留平台名稱與發佈紀錄，但之後無法再用「前往」開啟網址。',
      confirmLabel: '刪除平台',
      danger: true
    })
    if (!ok) return
    try {
      await api.deletePlatform(platform.id)
      await loadPlatforms()
      if (editingId === platform.id) closeForm()
      toast.success(`已刪除「${platform.name}」`)
    } catch (err) {
      toast.error(`刪除平台失敗：${errorMessage(err)}`)
    }
  }

  return (
    <div className="platform-manager">
      <div className="page-header">
        <h2>🌐 平台管理</h2>
        <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
          ＋ 新增平台
        </button>
      </div>
      <p className="hint">平台清單所有專案共用。貼文的「前往」按鈕會開啟這裡設定的網址。</p>

      {editingId !== null && (
        <form className="platform-form card" onSubmit={(e) => void handleSave(e)} onKeyDown={(e) => e.key === 'Escape' && closeForm()}>
          <h3 className="full-width">{editingId ? '編輯平台' : '新增平台'}</h3>
          <div className="field-group">
            <label htmlFor="platform-name">平台名稱</label>
            <input
              id="platform-name"
              type="text"
              value={form.name}
              maxLength={100}
              autoFocus
              onChange={(e) => update('name', e.target.value)}
              placeholder="例：Facebook"
            />
          </div>
          <div className="field-group">
            <label htmlFor="platform-icon">圖示（Emoji）</label>
            <input
              id="platform-icon"
              type="text"
              value={form.icon}
              maxLength={8}
              onChange={(e) => update('icon', e.target.value)}
              placeholder="例：📘"
            />
          </div>
          <div className="field-group full-width">
            <label htmlFor="platform-url">網址</label>
            <input
              id="platform-url"
              type="url"
              value={form.url}
              maxLength={2000}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://www.facebook.com"
            />
          </div>
          <div className="field-group full-width">
            <label htmlFor="platform-notes">備註</label>
            <input
              id="platform-notes"
              type="text"
              value={form.notes}
              maxLength={1000}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="例：粉專名稱、發文注意事項"
            />
          </div>
          {formError && (
            <div className="error-message full-width" role="alert">
              {formError}
            </div>
          )}
          <div className="form-actions full-width">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '儲存中…' : editingId ? '更新' : '新增'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>
              取消
            </button>
          </div>
        </form>
      )}

      {loaded && platforms.length === 0 ? (
        <p className="empty-message">還沒有平台，點「新增平台」開始。</p>
      ) : (
        <table className="platform-table">
          <thead>
            <tr>
              <th scope="col">圖示</th>
              <th scope="col">名稱</th>
              <th scope="col">網址</th>
              <th scope="col">備註</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <tr key={p.id} className={p.id === editingId ? 'editing' : ''}>
                <td>{p.icon || '🌐'}</td>
                <td>{p.name}</td>
                <td className="cell-ellipsis" title={p.url}>
                  {p.url || <span className="muted">未設定</span>}
                </td>
                <td className="cell-ellipsis" title={p.notes}>
                  {p.notes || <span className="muted">無</span>}
                </td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm(p)}>
                      編輯
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => void handleDelete(p)}>
                      刪除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
