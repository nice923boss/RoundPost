import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import logo from '../../../resources/128x128.png'
import { errorMessage } from '../../lib/api.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { flushEdits } from '../../stores/editorGuard.ts'
import { startSyncListener } from '../../stores/postStore.ts'
import { useProjectStore } from '../../stores/projectStore.ts'
import { toast } from '../../stores/toastStore.ts'
import type { Project } from '../../../shared/types.ts'

const NAV_ITEMS = [
  { to: '/dashboard', label: '📊 儀表板' },
  { to: '/calendar', label: '📅 行事曆' },
  { to: '/platforms', label: '🌐 平台管理' },
  { to: '/templates', label: '📝 範本' },
  { to: '/search', label: '🔍 搜尋' },
  { to: '/settings', label: '⚙️ 設定' }
]

function shortPath(path: string, keep = 3): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts.length <= keep ? path : `…/${parts.slice(-keep).join('/')}`
}

export default function AppShell() {
  const { projects, active, loaded, load, switchTo, create, remove } = useProjectStore()
  const [panelOpen, setPanelOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load().catch((err) => toast.error(`無法載入專案：${errorMessage(err)}`))
    return startSyncListener()
  }, [load])

  // The project panel closes on Escape or a click elsewhere.
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanelOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!footerRef.current?.contains(e.target as Node)) setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [panelOpen])

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true)
    try {
      await action()
    } catch (err) {
      toast.error(`${failure}：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleSwitch = (project: Project) => {
    setPanelOpen(false)
    if (project.id === active?.id) return
    void run(async () => {
      if (!(await flushEdits())) return
      await switchTo(project.id)
      toast.success(`已切換到「${project.name}」`)
    }, '切換專案失敗')
  }

  const handleDelete = async (project: Project) => {
    setPanelOpen(false)
    const ok = await confirmAction({
      title: `刪除專案「${project.name}」`,
      message:
        '此專案的貼文、平台與範本會一併刪除，資料庫檔會移到資源回收筒（需要時可從回收筒還原）。同步資料夾裡發文準備師的原始檔案不受影響。',
      confirmLabel: '刪除專案',
      danger: true
    })
    if (!ok) return
    void run(async () => {
      if (!(await flushEdits())) return
      await remove(project.id)
      toast.success(`已刪除專案「${project.name}」`)
    }, '刪除專案失敗')
  }

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    void run(async () => {
      if (!(await flushEdits())) return
      await create(name)
      setCreating(false)
      toast.success(`已建立並開啟「${name}」`)
    }, '建立專案失敗')
  }

  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="主選單">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src={logo} alt="" className="sidebar-logo" />
            <h1>RoundPost</h1>
          </div>
          <p>社群內容管理</p>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer" ref={footerRef}>
          <button
            type="button"
            className="project-switcher-btn"
            onClick={() => setPanelOpen(!panelOpen)}
            aria-expanded={panelOpen}
            disabled={busy}
            title={active?.sync_folder ? `同步資料夾：${active.sync_folder}` : '未設定同步資料夾'}
          >
            <span className="project-switcher-indicator">{active?.sync_folder ? '🟢' : '⚪'}</span>
            <span className="project-switcher-name">{active?.name ?? '載入中…'}</span>
            <span className="project-switcher-arrow">{panelOpen ? '▲' : '▼'}</span>
          </button>

          {panelOpen && (
            <div className="project-panel">
              <div className="project-panel-list">
                {projects.map((p) => (
                  <div key={p.id} className={`project-card ${p.id === active?.id ? 'project-card--active' : ''}`}>
                    <button type="button" className="project-card-main" onClick={() => handleSwitch(p)}>
                      <span className="project-card-status">{p.sync_folder ? '🟢' : '⚪'}</span>
                      <span className="project-card-info">
                        <span className="project-card-name">{p.name}</span>
                        <span className="project-card-path">{p.sync_folder ? shortPath(p.sync_folder) : '未設定同步資料夾'}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="project-card-logout"
                      title="刪除此專案"
                      aria-label={`刪除專案 ${p.name}`}
                      onClick={() => void handleDelete(p)}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="project-panel-add"
                onClick={() => {
                  setNewName('')
                  setCreating(true)
                  setPanelOpen(false)
                }}
              >
                ＋ 新增專案
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Pages remount when the project changes, so nothing from the previous project lingers. */}
      <main className="main-content" key={active?.id ?? 'none'}>
        {loaded ? <Outlet /> : <div className="empty-message page-loading">載入中…</div>}
      </main>

      <div className="author-credit">製作者：黃政文</div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <form
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreate}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
          >
            <h3 id="create-project-title">新增專案</h3>
            <div className="field-group">
              <label htmlFor="new-project-name">專案名稱</label>
              <input
                id="new-project-name"
                type="text"
                value={newName}
                maxLength={100}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例如：MemoFirst"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                取消
              </button>
              <button type="submit" className="btn btn-primary" disabled={!newName.trim() || busy}>
                建立
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
