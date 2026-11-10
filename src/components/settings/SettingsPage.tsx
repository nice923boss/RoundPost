import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, reportError } from '../../lib/api.ts'
import { formatTimestamp } from '../../lib/date.ts'
import { confirmAction } from '../../stores/confirmStore.ts'
import { useProjectStore } from '../../stores/projectStore.ts'
import { toast } from '../../stores/toastStore.ts'
import ImportSection from './ImportSection.tsx'
import { THEMES, type AppInfo, type SyncAction, type SyncStatus, type Theme } from '../../../shared/types.ts'

// What the user types to confirm clearing every post.
const CLEAR_PHRASE = '清除所有排程'

const THEME_LABELS: Record<Theme, string> = { system: '跟隨系統', light: '淺色', dark: '深色' }

const SYNC_ACTION_LABELS: Record<SyncAction, string> = {
  created: '新增',
  updated: '更新',
  skipped: '未變更',
  removed: '移除',
  error: '失敗'
}

function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return `${folder.replace(/[\\/]+$/, '')}${sep}${name}`
}

export default function SettingsPage() {
  const active = useProjectStore((s) => s.active)
  const chooseSyncFolder = useProjectStore((s) => s.chooseSyncFolder)
  const clearSyncFolder = useProjectStore((s) => s.clearSyncFolder)
  const clearAllPosts = useProjectStore((s) => s.clearAllPosts)
  const [theme, setTheme] = useState<Theme | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshSyncStatus = useCallback(async () => {
    try {
      setSyncStatus(await api.getSyncStatus())
    } catch (err) {
      reportError('讀取同步狀態失敗', err)
    }
  }, [])

  useEffect(() => {
    api.getTheme().then(setTheme, (err: unknown) => reportError('讀取主題失敗', err))
    api.getAppInfo().then(setInfo, (err: unknown) => reportError('讀取版本資訊失敗', err))
    void refreshSyncStatus()
    return api.onSyncEvent(() => void refreshSyncStatus())
  }, [refreshSyncStatus])

  const changeTheme = async (next: Theme) => {
    const previous = theme
    setTheme(next)
    try {
      await api.setTheme(next)
    } catch (err) {
      setTheme(previous)
      toast.error(`切換主題失敗：${errorMessage(err)}`)
    }
  }

  const handleChooseFolder = async () => {
    setBusy(true)
    try {
      if (await chooseSyncFolder()) {
        await refreshSyncStatus()
        toast.success('已設定同步資料夾，正在讀取檔案')
      }
    } catch (err) {
      toast.error(`設定同步資料夾失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleClearFolder = async () => {
    const ok = await confirmAction({
      title: '停止同步',
      message: '之後資料夾裡的檔案變更不會再更新到這個專案。已同步的貼文會保留。',
      confirmLabel: '停止同步'
    })
    if (!ok) return
    setBusy(true)
    try {
      await clearSyncFolder()
      await refreshSyncStatus()
      toast.success('已停止同步')
    } catch (err) {
      toast.error(`停止同步失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleClearAll = async () => {
    if (!active) return
    setBusy(true)
    try {
      const count = (await api.getPosts()).length
      if (count === 0) {
        toast.info('這個專案目前沒有任何貼文')
        return
      }
      const syncNote = active.sync_folder
        ? '\n\n這個專案連結了同步資料夾，清除時會一併停止同步，避免貼文從資料夾重新建立。資料夾裡的檔案不會被刪除。'
        : ''
      const ok = await confirmAction({
        title: `清除「${active.name}」的所有排程`,
        message: `將刪除這個專案的全部 ${count} 篇貼文（含未排程的草稿），行事曆會回到空白。\n平台、範本與其他專案不受影響。此動作無法復原。${syncNote}`,
        confirmLabel: '永久清除',
        danger: true,
        typeToConfirm: CLEAR_PHRASE
      })
      if (!ok) return
      const deleted = await clearAllPosts()
      await refreshSyncStatus()
      toast.success(`已清除 ${deleted} 篇貼文`)
    } catch (err) {
      toast.error(`清除失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const openLogFolder = async () => {
    try {
      await api.openLogFolder()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const syncFolder = active?.sync_folder ?? ''
  const lastEvent = syncStatus?.lastEvent

  return (
    <div className="settings-page">
      <div className="page-header">
        <h2>⚙️ 設定</h2>
      </div>

      <section className="settings-section">
        <h3>🎨 外觀</h3>
        <div className="theme-options" role="radiogroup" aria-label="主題">
          {THEMES.map((t) => (
            <label key={t} className={`theme-option ${theme === t ? 'active' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={t}
                checked={theme === t}
                disabled={theme === null}
                onChange={() => void changeTheme(t)}
              />
              {THEME_LABELS[t]}
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>📂 同步資料夾（{active?.name ?? '目前專案'}）</h3>
        <p className="hint">
          連結 HoloTeam 發文準備師的產出資料夾後，資料夾內 sync 子資料夾的 .md 檔會自動成為這個專案的貼文。
          請選「發文準備師」資料夾；選到 sync、輸出或專案資料夾也會自動對應。
        </p>
        <div className="settings-row">
          <input type="text" value={syncFolder} readOnly placeholder="尚未設定同步資料夾" aria-label="同步資料夾" title={syncFolder} />
          <button type="button" className="btn btn-secondary" onClick={() => void handleChooseFolder()} disabled={busy}>
            {syncFolder ? '更換…' : '選擇資料夾…'}
          </button>
          {syncFolder && (
            <button type="button" className="btn btn-secondary" onClick={() => void handleClearFolder()} disabled={busy}>
              停止同步
            </button>
          )}
        </div>
        {syncFolder && syncStatus && (
          <div className="sync-status">
            {syncStatus.watching ? (
              <p className="sync-status-ok">✅ 正在監控：{joinPath(syncFolder, 'sync')}</p>
            ) : (
              <p className="error-message">⚠️ 目前沒有在監控，請確認資料夾存在後重新選擇。</p>
            )}
            {lastEvent && (
              <p className="muted">
                最後同步：{formatTimestamp(lastEvent.at)}，{lastEvent.file || '資料夾'}（{SYNC_ACTION_LABELS[lastEvent.action]}
                {lastEvent.message ? `，${lastEvent.message}` : ''}）
              </p>
            )}
          </div>
        )}
      </section>

      <ImportSection />

      <section className="settings-section">
        <h3>🗑️ 清除所有排程（{active?.name ?? '目前專案'}）</h3>
        <p className="hint">
          刪除這個專案的全部貼文（含未排程的草稿），讓行事曆回到空白的初始狀態。平台、範本與其他專案不受影響。此動作無法復原，執行前需要輸入確認文字。
        </p>
        <div className="settings-row">
          <button type="button" className="btn btn-danger" onClick={() => void handleClearAll()} disabled={busy || !active}>
            🗑️ 清除所有排程
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>ℹ️ 關於</h3>
        <div className="about-info">
          <p>串門子 RoundPost {info ? `v${info.version}` : ''}</p>
          <p className="muted">社群內容管理與發佈工具</p>
          {info && (
            <dl className="about-paths">
              <dt>資料位置</dt>
              <dd title={info.userDataDir}>{info.userDataDir}</dd>
              <dt>記錄檔</dt>
              <dd title={info.logDir}>{info.logDir || '尚未建立'}</dd>
            </dl>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openLogFolder()} disabled={!info?.logDir}>
            開啟記錄檔資料夾
          </button>
        </div>
      </section>
    </div>
  )
}
