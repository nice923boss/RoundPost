import { useState } from 'react'
import { api, errorMessage } from '../../lib/api.ts'
import { usePostStore } from '../../stores/postStore.ts'
import { toast } from '../../stores/toastStore.ts'
import type { ImportSelection } from '../../../shared/api.ts'
import type { ColumnMapping, ImportResult } from '../../../shared/types.ts'

const FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'title', label: '標題（必填）' },
  { key: 'content', label: '內容' },
  { key: 'date', label: '日期' },
  { key: 'time', label: '時間' },
  { key: 'platforms', label: '平台' },
  { key: 'status', label: '狀態' }
]

const SAMPLE_ROWS = 5
const MAX_ERRORS_SHOWN = 20

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export default function ImportSection() {
  const [selection, setSelection] = useState<ImportSelection | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({ title: '' })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)

  const chooseFile = async () => {
    setBusy(true)
    try {
      const chosen = await api.chooseImportFile()
      if (!chosen) return
      setSelection(chosen)
      setMapping({ title: '', ...chosen.preview.suggestedMapping })
      setResult(null)
    } catch (err) {
      toast.error(`讀取檔案失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveTemplate = async () => {
    setBusy(true)
    try {
      const saved = await api.saveImportTemplate()
      if (saved) toast.success(`範本已儲存：${saved}`)
    } catch (err) {
      toast.error(`儲存範本失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const runImport = async () => {
    if (!mapping.title) return
    setBusy(true)
    try {
      const outcome = await api.runImport(mapping)
      setResult(outcome)
      if (outcome.imported > 0) void usePostStore.getState().loadPosts()
      toast.success(`匯入完成：新增 ${outcome.imported} 篇`)
    } catch (err) {
      toast.error(`匯入失敗：${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setSelection(null)
    setResult(null)
    setMapping({ title: '' })
  }

  const preview = selection?.preview

  return (
    <section className="settings-section">
      <h3>📊 匯入貼文</h3>
      <p className="hint">
        第一次使用建議先下載範本，照欄位填好再匯入。支援 Excel（.xlsx）、CSV、TSV 與 Tab 分隔的 .txt，第一列必須是欄位名稱。標題與日期都相同的貼文會略過，不會重複建立。
      </p>

      <div className="settings-row">
        <button type="button" className="btn btn-secondary" onClick={() => void chooseFile()} disabled={busy}>
          📂 {selection ? '重新選擇檔案' : '選擇檔案'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void saveTemplate()} disabled={busy}>
          📥 下載範本
        </button>
        {selection && <span className="muted" title={selection.file}>{fileName(selection.file)}，共 {preview?.totalRows ?? 0} 列</span>}
      </div>

      {preview && !result && (
        <>
          {preview.headers.length === 0 ? (
            <p className="error-message" role="alert">
              檔案裡沒有資料，請確認第一列是欄位名稱。
            </p>
          ) : (
            <>
              <h4>預覽（前 {Math.min(SAMPLE_ROWS, preview.sampleRows.length)} 列）</h4>
              <div className="import-preview">
                <table className="platform-table">
                  <thead>
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.slice(0, SAMPLE_ROWS).map((row, i) => (
                      <tr key={i}>
                        {preview.headers.map((h) => (
                          <td key={h} className="cell-ellipsis" title={row[h]}>
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4>欄位對應</h4>
              <p className="hint">已依欄位名稱自動選好，請確認。不需要的欄位選「不匯入」。</p>
              <div className="import-mapping">
                {FIELDS.map(({ key, label }) => (
                  <div className="field-group" key={key}>
                    <label htmlFor={`import-map-${key}`}>{label}</label>
                    <select
                      id={`import-map-${key}`}
                      value={mapping[key] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                    >
                      <option value="">{key === 'title' ? '請選擇' : '不匯入'}</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => void runImport()} disabled={busy || !mapping.title}>
                  {busy ? '匯入中…' : `匯入 ${preview.totalRows} 列`}
                </button>
                <button type="button" className="btn btn-secondary" onClick={reset} disabled={busy}>
                  取消
                </button>
              </div>
            </>
          )}
        </>
      )}

      {result && (
        <div className="import-result card" role="status">
          <p>
            新增 <strong>{result.imported}</strong> 篇，略過重複 <strong>{result.skipped}</strong> 篇
            {result.errors.length > 0 && (
              <>
                ，失敗 <strong>{result.errors.length}</strong> 列
              </>
            )}
            。
          </p>
          {result.unknownPlatforms.length > 0 && (
            <p className="hint">
              以下平台不在平台清單中，未加入：{result.unknownPlatforms.join('、')}。請先在平台管理新增後再匯入。
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="import-errors">
              {result.errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (
                <li key={e.row}>
                  第 {e.row} 列：{e.message}
                </li>
              ))}
              {result.errors.length > MAX_ERRORS_SHOWN && <li>另有 {result.errors.length - MAX_ERRORS_SHOWN} 列失敗</li>}
            </ul>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={reset}>
              完成
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
