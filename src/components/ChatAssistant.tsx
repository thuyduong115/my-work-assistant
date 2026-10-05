import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Loader2, MessageCircle, Plus, Send, Trash2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useProjects, useTasks } from '@/db/hooks'
import { createTask } from '@/db/actions'
import type { Habit, HabitLog, Project, Task } from '@/db/types'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/db/types'
import { aiChat, aiConfig, type AITask, type ChatMsg } from '@/ai/ai'
import { topTasks } from '@/lib/scheduler'
import { habitActiveOn } from '@/lib/stats'
import { fmtAmount, habitTarget, habitUnit, isHabitDone, logValue } from '@/lib/habits'
import { cn, dayKey, fmtMin } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { Button } from './ui/button'

const STORE = 'mwa-chat'
const STARTERS = ['Hôm nay tôi nên làm gì trước?', 'Lên kế hoạch cho tuần này giúp tôi', 'Tôi đang trì hoãn, giúp tôi bắt đầu', 'Gợi ý thói quen tốt cho tôi', 'Việc nào sắp trễ hạn?']

function buildContext(tasks: Task[], projects: Project[], habits: Habit[], logs: HabitLog[]) {
  const today = dayKey()
  const open = topTasks(tasks).filter((t) => t.status !== 'done')
  const pname = (id?: string) => projects.find((p) => p.id === id)?.name
  const line = (t: Task) => {
    const block = t.plan?.find((b) => b.date === today)
    return `- ${t.title}${pname(t.projectId) ? ` [${pname(t.projectId)}]` : ''} | ${PRIORITY_LABEL[t.priority]} | ${fmtMin(t.estimateMin)}${t.deadline ? ` | hạn ${t.deadline}${t.deadline < today ? ' (QUÁ HẠN)' : ''}` : ''}${block ? ` | lịch hôm nay ${block.start}` : ''}${t.postponeCount ? ` | dời ${t.postponeCount} lần` : ''}${t.status === 'doing' ? ' | đang làm' : ''}`
  }
  const sorted = [...open].sort((a, b) => (a.deadline ?? '9999') < (b.deadline ?? '9999') ? -1 : 1)
  const doneToday = tasks.filter((t) => t.doneAt && dayKey(new Date(t.doneAt)) === today).map((t) => t.title)
  const hab = habits
    .filter((h) => !h.archived && habitActiveOn(h, today))
    .map((h) => `- ${h.name}: ${fmtAmount(logValue(logs, h, today), habitUnit(h))}/${fmtAmount(habitTarget(h), habitUnit(h))}${isHabitDone(h, logValue(logs, h, today)) ? ' ✓' : ''}`)
  return [
    `Task đang mở (${open.length}, hiển thị tối đa 40):`,
    ...sorted.slice(0, 40).map(line),
    `Đã xong hôm nay: ${doneToday.join('; ') || 'chưa có'}`,
    `Project đang chạy: ${projects.filter((p) => p.status === 'active').map((p) => p.name).join('; ') || 'không'}`,
    'Thói quen hôm nay:',
    ...(hab.length ? hab : ['- (chưa có)']),
  ].join('\n')
}

function mdLite(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*]\s+/gm, '• ')
}

export function ChatAssistant() {
  const { chatOpen, chatPrefill, setChat } = useUI()
  const tasks = useTasks() ?? []
  const projects = useProjects()
  const habits = useHabits()
  const logs = useHabitLogs()
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE) ?? '[]')
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const end = useRef<HTMLDivElement>(null)
  const context = useMemo(() => buildContext(tasks, projects, habits, logs), [tasks, projects, habits, logs])

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(msgs.slice(-40)))
    } catch {
      /* ignore */
    }
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, chatOpen])

  useEffect(() => {
    if (chatOpen && chatPrefill) {
      setInput('')
      void send(chatPrefill)
      setChat(true, undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatPrefill])

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    if (!aiConfig().ready) return toast.error('Cần API key AI', { description: 'Vào Cài đặt → AI để thêm key Gemini miễn phí.' })
    const next: ChatMsg[] = [...msgs, { role: 'user', text: text.trim() }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    try {
      setMsgs([...next, await aiChat(next, context)])
    } catch (e) {
      setMsgs([...next, { role: 'assistant', text: '⚠️ ' + (e as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  const add = async (t: AITask, key: string) => {
    await createTask({ title: t.title, notes: t.notes || undefined, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline || undefined })
    setAdded((s) => new Set(s).add(key))
    toast.success('Đã thêm task', { description: t.title })
  }

  return (
    <>
      {!chatOpen && (
        <button
          onClick={() => setChat(true)}
          className="fixed right-4 bottom-36 z-30 grid size-12 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg shadow-primary/30 transition hover:scale-105 active:scale-95 sm:bottom-6 sm:size-14"
          aria-label="Chat với trợ lý AI"
          title="Chat với trợ lý AI"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
      {chatOpen && (
        <div className="animate-pop fixed inset-x-2 bottom-2 z-40 flex h-[min(75dvh,600px)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px]">
          <div className="flex items-center gap-2 border-b bg-gradient-to-r from-violet-500/15 to-pink-500/15 px-4 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white">
              <Bot className="size-4" />
            </span>
            <div className="flex-1 leading-tight">
              <div className="text-sm font-semibold">Trợ lý công việc</div>
              <div className="text-[11px] text-muted-foreground">Biết task, lịch & thói quen của bạn</div>
            </div>
            {msgs.length > 0 && (
              <Button size="icon-sm" variant="ghost" onClick={() => setMsgs([])} title="Xoá hội thoại">
                <Trash2 />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={() => setChat(false)} aria-label="Đóng">
              <X />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {msgs.length === 0 && (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">Xin chào! 👋 Hỏi mình bất cứ điều gì về công việc của bạn:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => void send(s)} className="rounded-full border px-3 py-1.5 text-xs transition hover:border-primary hover:text-primary">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted')}>
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: mdLite(m.text) }} />
                  {m.tasks && m.tasks.length > 0 && (
                    <div className="mt-2 grid gap-1.5">
                      {m.tasks.map((t, j) => {
                        const key = `${i}-${j}`
                        const done = added.has(key)
                        return (
                          <div key={key} className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-foreground">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{t.title}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {fmtMin(t.estimateMin)}
                                {t.deadline ? ` · hạn ${t.deadline.slice(8)}/${t.deadline.slice(5, 7)}` : ''}
                              </div>
                            </div>
                            <Button size="sm" variant={done ? 'ghost' : 'soft'} className="h-7 px-2" disabled={done} onClick={() => void add(t, key)}>
                              {done ? <Check /> : <Plus />} {done ? 'Đã thêm' : 'Thêm'}
                            </Button>
                          </div>
                        )
                      })}
                      {m.tasks.length > 1 && m.tasks.some((_, j) => !added.has(`${i}-${j}`)) && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => m.tasks!.forEach((t, j) => !added.has(`${i}-${j}`) && void add(t, `${i}-${j}`))}>
                          <Plus /> Thêm tất cả
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Trợ lý đang suy nghĩ…
              </div>
            )}
            <div ref={end} />
          </div>

          <form
            className="flex gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi trợ lý… (VD: chiều nay rảnh 2 tiếng, làm gì?)"
              className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <Button type="submit" size="icon" className="size-10 rounded-xl" disabled={busy || !input.trim()} aria-label="Gửi">
              <Send />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
