import { useEffect } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Bot, Moon, Plus, Sparkles, Sun, Timer, PictureInPicture2, CheckSquare } from 'lucide-react'
import { useTasks } from '@/db/hooks'
import { useSettings } from '@/stores/settings'
import { useTimerView } from './Timer'
import { useUI } from '@/stores/ui'
import { openMini } from '@/stores/pip'
import { NAV_FLAT } from './layout/nav'

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement
  return el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)
}

export function CommandPalette() {
  const { paletteOpen, setPalette, openCapture, createTask, openTask } = useUI()
  const nav = useNavigate()
  const tasks = useTasks() ?? []
  const { theme, set } = useSettings()
  const timer = useTimerView()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(!useUI.getState().paletteOpen)
        return
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role=dialog]')) return
      if (e.key === 'n') {
        e.preventDefault()
        openCapture()
      } else if (e.key === 'a') {
        e.preventDefault()
        createTask()
      } else {
        const item = NAV_FLAT.find((i) => i.key === e.key)
        if (item) nav(item.to)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, openCapture, createTask, setPalette])

  const run = (fn: () => void) => {
    setPalette(false)
    fn()
  }
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground'

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPalette}
      label="Lệnh nhanh"
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="animate-pop fixed top-[15%] left-1/2 z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-card shadow-2xl"
    >
      <Command.Input placeholder="Gõ lệnh hoặc tìm task…" className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground" />
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-sm text-muted-foreground">Không tìm thấy.</Command.Empty>
        <Command.Group heading="Hành động" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item className={item} onSelect={() => run(() => openCapture())}>
            <Sparkles /> Nhập nhanh bằng AI <kbd className="ml-auto text-[10px]">N</kbd>
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => useUI.getState().setChat(true))}>
            <Bot /> Chat với trợ lý AI
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => createTask())}>
            <Plus /> Thêm task thủ công <kbd className="ml-auto text-[10px]">A</kbd>
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => (timer.running ? timer.pause() : timer.active ? timer.resume() : timer.start()))}>
            <Timer /> {timer.running ? 'Tạm dừng đồng hồ' : 'Bắt đầu Pomodoro'}
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => void openMini())}>
            <PictureInPicture2 /> Mở cửa sổ mini (luôn nổi)
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => set({ theme: theme === 'dark' ? 'light' : 'dark' }))}>
            {theme === 'dark' ? <Sun /> : <Moon />} Đổi giao diện sáng/tối
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Đi tới" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          {NAV_FLAT.map((n) => (
            <Command.Item key={n.to} className={item} onSelect={() => run(() => nav(n.to))}>
              <n.icon /> {n.label} <kbd className="ml-auto text-[10px] uppercase">{n.key}</kbd>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Task" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          {tasks
            .filter((t) => t.status !== 'done')
            .slice(0, 200)
            .map((t) => (
              <Command.Item key={t.id} value={t.title + ' ' + t.id} className={item} onSelect={() => run(() => openTask(t.id))}>
                <CheckSquare /> <span className="truncate">{t.title}</span>
              </Command.Item>
            ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
