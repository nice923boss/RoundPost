import { useEffect, useRef } from 'react'
import { useConfirmStore } from '../../stores/confirmStore.ts'

export default function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request)
  const settle = useConfirmStore((s) => s.settle)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!request) return
    confirmRef.current?.focus()
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
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => settle(false)}>
            取消
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? '確定'}
          </button>
        </div>
      </div>
    </div>
  )
}
