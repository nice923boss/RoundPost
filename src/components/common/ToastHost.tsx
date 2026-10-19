import { useToastStore } from '../../stores/toastStore.ts'

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast--${t.kind}`} onClick={() => dismiss(t.id)} title="點一下關閉">
          {t.message}
        </button>
      ))}
    </div>
  )
}
