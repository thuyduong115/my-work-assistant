import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'

const CHUNK_ERR = /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i

/** Reload once when files from an older deploy are gone (guarded against loops) */
export function reloadOnce(reason: string) {
  const key = 'mwa-reloaded-at'
  const last = Number(sessionStorage.getItem(key) ?? 0)
  if (Date.now() - last < 15_000) return false
  sessionStorage.setItem(key, String(Date.now()))
  console.warn('Reloading:', reason)
  location.reload()
  return true
}

interface State {
  error: Error | null
}

/** Keeps one broken page from blanking the whole app; resets when `resetKey` (the route) changes */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
    if (CHUNK_ERR.test(error.message)) reloadOnce(error.message)
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" />
        </span>
        <h2 className="text-lg font-semibold">Trang này gặp lỗi</h2>
        <p className="text-sm text-muted-foreground">
          Nếu bạn đang bật tiện ích dịch trang (Google Dịch…), hãy tắt nó cho trang này — tiện ích dịch làm hỏng giao diện.
        </p>
        <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{this.state.error.message}</code>
        <Button onClick={() => location.reload()}>
          <RefreshCw /> Tải lại
        </Button>
      </div>
    )
  }
}
