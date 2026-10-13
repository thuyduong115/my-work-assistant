import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { seed } from './db/db'
import { initSync } from './sync/sync'
import { ErrorBoundary, reloadOnce } from './components/ErrorBoundary'

// seed first so default rows can never land on top of freshly pulled ones
void seed().finally(() => {
  if (!location.hash.startsWith('#/mini')) void initSync()
})
registerSW({ immediate: true })
// a page chunk from an older deploy is gone → load the new version
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnce('preload error')) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary resetKey="root" fullScreen>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
