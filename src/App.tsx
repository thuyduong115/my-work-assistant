import { lazy, Suspense, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { TaskEditor } from '@/components/TaskEditor'
import { QuickCapture } from '@/components/QuickCapture'
import { CommandPalette } from '@/components/CommandPalette'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { MiniTimer, useTimerEngine } from '@/components/Timer'
import { useAutoSchedule } from '@/lib/autoSchedule'
import { usePip } from '@/stores/pip'
import { applyTheme, useSettings } from '@/stores/settings'
import Today from '@/pages/Today'

const Inbox = lazy(() => import('@/pages/Inbox'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Projects = lazy(() => import('@/pages/Projects'))
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'))
const Roles = lazy(() => import('@/pages/Roles'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
import Habits from '@/pages/Habits'
const Focus = lazy(() => import('@/pages/Focus'))
const Matrix = lazy(() => import('@/pages/Matrix'))
const Settings = lazy(() => import('@/pages/Settings'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function Main() {
  const { pathname } = useLocation()
  useTimerEngine()
  useAutoSchedule()
  const pip = usePip((s) => s.win)
  const theme = useSettings((s) => s.theme)
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return (
    <>
      <ScrollTop />
      <AppLayout>
        <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">Đang tải…</div>}>
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/focus" element={<Focus />} />
            <Route path="/matrix" element={<Matrix />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Today />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </AppLayout>
      <TaskEditor />
      <QuickCapture />
      <CommandPalette />
      <Toaster position="bottom-right" theme={theme === 'system' ? 'system' : dark ? 'dark' : 'light'} richColors closeButton offset={{ bottom: 80, right: 16 }} />
      {pip && createPortal(<MiniTimer />, pip.document.body)}
    </>
  )
}

/** Fallback popup window (#/mini) for browsers without Document PiP */
function MiniOnly() {
  const { theme, accent } = useSettings()
  useEffect(() => applyTheme(theme, accent), [theme, accent])
  return <MiniTimer />
}

export default function App() {
  const isMini = location.hash.startsWith('#/mini')
  return <HashRouter>{isMini ? <MiniOnly /> : <Main />}</HashRouter>
}
