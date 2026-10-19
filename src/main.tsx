import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import ErrorBoundary from './components/common/ErrorBoundary.tsx'
import { api, reportError } from './lib/api.ts'
import { flushEdits } from './stores/editorGuard.ts'
import './App.css'

// Errors outside React rendering (event handlers, promises) go to the same log file.
window.addEventListener('error', (event) => reportError('未預期的錯誤', event.error ?? event.message))
window.addEventListener('unhandledrejection', (event) => reportError('未處理的非同步錯誤', event.reason))

// Closing the window saves the open editor first.
api.onFlushRequest(flushEdits)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>
)
