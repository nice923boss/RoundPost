import { useEffect, useRef, useState } from 'react'
import { useConfirmStore } from '../../stores/confirmStore.ts'

export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request)
  const settle = useConfirmStore((s) => s.settle)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const typedRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')

  const expected = request?.typeToConfirm
  const canConfirm = expected === undefined || typed.trim() === expected

  useEffect(() => {
    if (!request) return
    setTyped('')
    if (request.typeToConfirm === undefined) confirmRef.current?.focus()
    else typedRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, settle])

  if (!request) return null

  return (
    <div className="modal-overlay" onClick={() => settle(false)}>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title">{request.title}</h3>
        <p className="modal-message">{request.message}</p>
        {expected !== undefined && (
          <div className="field-group confirm-type">
            <label htmlFor="confirm-typed">
              請輸入「<strong>{expected}</strong>」以確認
            </label>
            <input
              id="confirm-typed"
              ref={typedRef}
              type="text"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && canConfirm) settle(true)
              }}
            />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
            取消
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => settle(true)}
            disabled={!canConfirm}
          >
            {request.confirmLabel ?? '確定'}
          </button>
        </div>
      </div>
    </div>
  )
}
