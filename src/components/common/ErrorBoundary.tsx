import { Component, type ErrorInfo, type ReactNode } from 'react'
import { errorMessage, reportError } from '../../lib/api.ts'

interface Props {
  children: ReactNode
}

interface State {
  error: unknown
}

/** Shows a recoverable error screen instead of a blank window when a page crashes. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportError(`畫面錯誤${info.componentStack ? `\n${info.componentStack}` : ''}`, error)
  }

  render() {
    if (this.state.error === null) return this.props.children
    return (
      <div className="error-screen" role="alert">
        <h2>畫面發生錯誤</h2>
        <p>{errorMessage(this.state.error)}</p>
        <p className="hint">錯誤已寫入記錄檔（說明 → 開啟記錄檔資料夾）。資料不受影響，可以重新載入後繼續。</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
            返回
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            重新載入
          </button>
        </div>
      </div>
    )
  }
}
