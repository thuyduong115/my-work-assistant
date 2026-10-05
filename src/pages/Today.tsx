import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Clock, Flame, Loader2, Plus, Sparkles, Sun, Target, Timer as TimerIcon, Wand2, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useProjects, useTasks, useTimeEntries } from '@/db/hooks'
import { createTask, postpone, updateTask } from '@/db/actions'
import type { Task } from '@/db/types'
import { aiConfig, aiDailyPlan } from '@/ai/ai'
import { parseDate, parseDuration } from '@/ai/fallback'
import { actualMinutes } from '@/lib/scheduler'
import { todayView, subCounts } from '@/lib/selectors'
import { activityByDay, focusByDay, streak } from '@/lib/stats'
import { useSchedule } from '@/lib/autoSchedule'
import { dayKey, fmtClock, fmtMin } from '@/lib/utils'
import { useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Empty, Progress, Stat } from '@/components/ui/misc'
import { TaskItem } from '@/components/TaskItem'
import { Ring, TimerControls, useTimerView, PHASE_LABEL } from '@/components/Timer'
import { HabitsToday } from './Habits'
import { GcalToday } from '@/gcal/GcalUI'
import { AppIcon } from '@/components/AppIcon'

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Chào buổi sáng'
  if (h < 14) return 'Chào buổi trưa'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

const QUOTES = [
  'Bắt đầu nhỏ thôi — 2 phút là đủ để vượt qua sự trì hoãn.',
  'Làm xong quan trọng hơn làm hoàn hảo.',
  'Ăn con ếch trước: làm việc khó nhất vào buổi sáng.',
  'Một bước nhỏ mỗi ngày tạo nên thay đổi lớn.',
  'Tập trung vào 3 việc quan trọng nhất hôm nay.',
  'Bạn không cần có động lực để bắt đầu — bắt đầu sẽ tạo ra động lực.',
]

function QuickAdd() {
  const [v, setV] = useState('')
  return (
    <form
      className="flex gap-2 px-3 pt-1"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.trim()) return
        const [deadline, t1] = parseDate(v)
        const [est, t2] = parseDuration(t1)
        await createTask({ title: t2 || v, scheduledDate: deadline ? undefined : dayKey(), deadline: deadline ?? undefined, estimateMin: est ?? 30 })
        setV('')
      }}
    >
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="+ Thêm việc cho hôm nay (vd: Gọi điện cho mẹ 15p)" className="h-9 border-dashed bg-transparent" />
      <Button type="submit" size="icon" variant="soft" aria-label="Thêm">
        <Plus />
      </Button>
    </form>
  )
}

function FocusCard() {
  const v = useTimerView()
  const tasks = useTasks() ?? []
  const task = tasks.find((t) => t.id === v.taskId)
  return (
    <Card>
      <CardHeader title="Tập trung" icon={<TimerIcon />} action={<Link to="/focus" className="text-xs text-primary hover:underline">Mở lớn</Link>} />
      <CardBody className="flex flex-col items-center gap-3">
        <Ring progress={v.total ? v.progress : (v.elapsed % 3600) / 3600} size={150} stroke={10} color={v.phase === 'focus' ? 'var(--primary)' : 'var(--success)'}>
          <div className="text-center">
            <div className="tabular font-mono text-3xl font-bold">{fmtClock(v.active ? v.display : v.total || 0)}</div>
            <div className="text-[11px] text-muted-foreground">{PHASE_LABEL[v.phase]}</div>
          </div>
        </Ring>
        <div className="line-clamp-1 text-center text-sm font-medium">{task?.title ?? 'Bấm ▶ trên 1 task để bắt đầu'}</div>
        <TimerControls size="sm" />
      </CardBody>
    </Card>
  )
}

interface Top3 {
  date: string
  top3: { title: string; why: string }[]
  message: string
}

function AITop3({ tasks }: { tasks: Task[] }) {
  const key = 'mwa-top3'
  const [data, setData] = useState<Top3 | null>(() => {
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? 'null') as Top3 | null
      return d?.date === dayKey() ? d : null
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)
  const openTask = useUI((s) => s.openTask)
  const open = tasks.filter((t) => t.status !== 'done')
  const run = async () => {
    if (!aiConfig().ready) return toast.error('Cần API key AI', { description: 'Cài đặt → AI (Gemini miễn phí)' })
    setBusy(true)
    try {
      const summary = open
        .slice(0, 60)
        .map((t) => `- ${t.title} | ưu tiên ${t.priority} | ước lượng ${t.estimateMin}p | deadline ${t.deadline ?? 'không'} | dời ${t.postponeCount} lần${t.plan?.some((b) => b.date === dayKey()) ? ' | đã xếp lịch hôm nay' : ''}`)
        .join('\n')
      const r = await aiDailyPlan(`Danh sách task:\n${summary}`)
      const d = { ...r, date: dayKey() }
      localStorage.setItem(key, JSON.stringify(d))
      setData(d)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader
        title="3 việc quan trọng nhất"
        icon={<Target />}
        action={
          <Button size="sm" variant="soft" onClick={run} disabled={busy || !open.length}>
            {busy ? <Loader2 className="animate-spin" /> : data ? <RotateCcw /> : <Sparkles />} {data ? 'Làm lại' : 'AI gợi ý'}
          </Button>
        }
      />
      <CardBody>
        {data ? (
          <div className="grid gap-2">
            {data.top3.map((x, i) => {
              const t = open.find((o) => o.title === x.title)
              return (
                <button key={i} onClick={() => t && openTask(t.id)} className="flex gap-3 rounded-lg p-2 text-left transition hover:bg-muted">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                  <span>
                    <span className={`block text-sm font-medium ${t ? '' : 'line-through opacity-60'}`}>{x.title}</span>
                    <span className="text-xs text-muted-foreground">{x.why}</span>
                  </span>
                </button>
              )
            })}
            {data.message && <p className="rounded-lg bg-primary-soft p-2.5 text-xs text-primary">💬 {data.message}</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Để AI chọn 3 việc nên ưu tiên hôm nay dựa trên deadline, độ ưu tiên và số lần bạn đã dời.</p>
        )}
      </CardBody>
    </Card>
  )
}

export default function Today() {
  const tasks = useTasks()
  const entries = useTimeEntries()
  const logs = useHabitLogs()
  const habits = useHabits()
  const projects = useProjects()
  const { openCapture } = useUI()
  const goal = useSettings((s) => s.dailyGoalMin)
  const risks = useSchedule((s) => s.risks)
  const [showDone, setShowDone] = useState(false)
  const all = useMemo(() => tasks ?? [], [tasks])
  const today = dayKey()

  const v = useMemo(() => todayView(all, today), [all, today])
  const actual = useMemo(() => actualMinutes(entries), [entries])
  const subs = useMemo(() => subCounts(all), [all])
  const focusToday = useMemo(() => focusByDay(entries).get(today) ?? 0, [entries, today])
  const st = useMemo(() => {
    const act = activityByDay(all, entries, logs)
    return streak((k) => !!act.get(k)?.productive)
  }, [all, entries, logs])
  const parentTitle = (t: Task) => (t.parentId ? all.find((p) => p.id === t.parentId)?.title : undefined)
  const quote = QUOTES[new Date().getDate() % QUOTES.length]
  const doneCount = v.doneToday.length
  const totalToday = v.items.length + doneCount
  const plannedMin = v.items.reduce((s, i) => s + (i.task.plan?.find((b) => b.date === today)?.min ?? i.task.estimateMin), 0)
  const riskTasks = risks.map((r) => ({ ...r, task: all.find((t) => t.id === r.taskId) })).filter((r) => r.task && r.task.status !== 'done')

  if (!tasks) return null

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary capitalize">{format(new Date(), 'EEEE, dd MMMM yyyy', { locale: vi })}</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()} <Sun className="size-6 text-amber-400" />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{quote}</p>
        </div>
        <Button onClick={() => openCapture()} size="lg" className="hidden sm:inline-flex">
          <Sparkles /> Nhập việc — AI tách giúp
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hôm nay" value={`${doneCount}/${totalToday}`} sub={<Progress value={totalToday ? doneCount / totalToday : 0} className="mt-1.5 h-1.5" />} icon={<CheckCircle2 />} />
        <Link to="/dashboard">
          <Stat label="Quá hạn" value={v.overdue.length} sub={v.overdue.length ? 'Xử lý ngay nhé!' : 'Không có 🎉'} icon={<AlertTriangle />} color={v.overdue.length ? '#ef4444' : '#22c55e'} className={v.overdue.length ? 'border-destructive/40' : ''} />
        </Link>
        <Stat label="Tập trung" value={fmtMin(focusToday)} sub={<Progress value={focusToday / goal} className="mt-1.5 h-1.5" color="#14b8a6" />} icon={<Clock />} color="#14b8a6" />
        <Stat label="Chuỗi ngày" value={`${st} 🔥`} sub={st ? 'Giữ lửa hôm nay nhé!' : 'Hoàn thành 1 task để bắt đầu'} icon={<Flame />} color="#f97316" />
      </div>

      {riskTasks.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <b className="text-destructive">Không đủ thời gian trước deadline:</b>{' '}
            {riskTasks.slice(0, 4).map((r, i) => (
              <span key={r.taskId}>
                {i > 0 && ', '}
                {r.task!.title} (thiếu {fmtMin(r.shortMin)})
              </span>
            ))}
            . <span className="text-muted-foreground">Thêm giờ làm việc trong Cài đặt, giảm phạm vi hoặc dời deadline.</span>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-5">
          {v.overdue.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader title={`Quá hạn (${v.overdue.length})`} icon={<AlertTriangle className="!text-destructive" />} description="Làm ngay, chia nhỏ, hoặc đặt deadline mới thực tế hơn." />
              <div className="px-2 pb-2">
                {v.overdue.map((t) => (
                  <TaskItem key={t.id} task={t} actualMin={actual.get(t.id)} subCount={subs.get(t.id)} planLabel={parentTitle(t) && `↳ ${parentTitle(t)}`} />
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Việc hôm nay"
              icon={<CalendarClock />}
              description={totalToday ? `${v.items.length} việc còn lại · khoảng ${fmtMin(plannedMin)}` : undefined}
              action={
                <Link to="/calendar" className="text-xs text-primary hover:underline">
                  Xem lịch →
                </Link>
              }
            />
            <QuickAdd />
            <div className="px-2 pt-1 pb-2">
              {v.items.length === 0 && doneCount === 0 && (
                <Empty
                  icon={<Wand2 />}
                  title="Chưa có việc cho hôm nay"
                  hint="Nhập mục tiêu của bạn, AI sẽ tách thành task và tự xếp vào giờ rảnh."
                  action={
                    <Button size="sm" className="mt-2" onClick={() => openCapture()}>
                      <Sparkles /> Nhập nhanh
                    </Button>
                  }
                />
              )}
              {v.items.map((i) => (
                <TaskItem key={i.task.id} task={i.task} planLabel={i.planLabel ?? (parentTitle(i.task) && `↳ ${parentTitle(i.task)}`)} actualMin={actual.get(i.task.id)} subCount={subs.get(i.task.id)} />
              ))}
              {doneCount > 0 && (
                <>
                  <button onClick={() => setShowDone(!showDone)} className="mt-1 flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className={`size-3.5 transition ${showDone ? '' : '-rotate-90'}`} /> Đã xong ({doneCount})
                  </button>
                  {showDone && v.doneToday.map((t) => <TaskItem key={t.id} task={t} compact actualMin={actual.get(t.id)} />)}
                </>
              )}
            </div>
          </Card>

          {v.missed.length > 0 && (
            <Card>
              <CardHeader title={`Bị lỡ kế hoạch (${v.missed.length})`} icon={<RotateCcw />} description="Những việc đã định làm trước đây nhưng chưa xong." />
              <div className="grid gap-1 px-2 pb-2">
                {v.missed.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <TaskItem task={t} actualMin={actual.get(t.id)} />
                    </div>
                    <Button size="sm" variant="soft" onClick={() => updateTask(t.id, { scheduledDate: today, pinned: false, postponeCount: t.postponeCount + 1 })}>
                      Làm hôm nay
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => postpone(t)}>
                      Dời
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {v.upcoming.length > 0 && (
            <Card>
              <CardHeader title="Deadline 7 ngày tới" icon={<CalendarClock />} />
              <div className="px-2 pb-2">
                {v.upcoming.map((t) => (
                  <TaskItem key={t.id} task={t} actualMin={actual.get(t.id)} subCount={subs.get(t.id)} planLabel={t.plan?.find((b) => b.date >= today) ? `Lịch: ${t.plan.find((b) => b.date >= today)!.date.slice(8)}/${t.plan.find((b) => b.date >= today)!.date.slice(5, 7)}` : undefined} />
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-5">
          <FocusCard />
          <GcalToday />
          <AITop3 tasks={all} />
          <HabitsToday habits={habits} logs={logs} />
          {projects.filter((p) => p.status === 'active').length > 0 && <ProjectsMini />}
        </div>
      </div>
    </div>
  )
}

function ProjectsMini() {
  const projects = useProjects().filter((p) => p.status === 'active')
  const tasks = useTasks() ?? []
  return (
    <Card>
      <CardHeader title="Tiến độ project" icon={<Target />} action={<Link to="/projects" className="text-xs text-primary hover:underline">Tất cả</Link>} />
      <CardBody className="grid gap-3">
        {projects.slice(0, 5).map((p) => {
          const ts = tasks.filter((t) => t.projectId === p.id)
          const done = ts.filter((t) => t.status === 'done').length
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="group">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate font-medium group-hover:text-primary">
                  <AppIcon value={p.icon} size={14} className="mr-1 align-[-2px]" style={{ color: p.color }} />
                  {p.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {done}/{ts.length}
                </span>
              </div>
              <Progress value={ts.length ? done / ts.length : 0} color={p.color} className="h-1.5" />
            </Link>
          )
        })}
      </CardBody>
    </Card>
  )
}
