import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Pause, Play, PictureInPicture2, SkipForward, Square, Timer as TimerIcon, Coffee } from 'lucide-react'
import { useTasks } from '@/db/hooks'
import { completeTask } from '@/lib/celebrate'
import { cn, dayKey, fmtClock } from '@/lib/utils'
import { useNow } from '@/lib/useNow'
import { elapsedMs, phaseMinutes, useTimer, type Phase } from '@/stores/timer'
import { openMini } from '@/stores/pip'
import { Button } from './ui/button'

export const PHASE_LABEL: Record<Phase, string> = { focus: 'Tập trung', short: 'Nghỉ ngắn', long: 'Nghỉ dài' }

export function useTimerView() {
  const t = useTimer()
  const now = useNow(1000, t.running)
  const elapsed = elapsedMs(t, now) / 1000
  const total = t.mode === 'pomodoro' ? phaseMinutes(t.phase) * 60 : 0
  const remaining = total ? Math.max(0, total - elapsed) : 0
  const display = t.mode === 'pomodoro' ? remaining : elapsed
  const progress = total ? Math.min(1, elapsed / total) : 0
  const active = t.running || t.accumulated > 0
  return { ...t, elapsed, total, remaining, display, progress, active }
}

/** Runs in the main window: finishes pomodoro phases on time */
export function useTimerEngine() {
  useEffect(() => {
    const id = setInterval(() => {
      const s = useTimer.getState()
      if (s.mode !== 'pomodoro' || !s.running) return
      if (elapsedMs(s) >= phaseMinutes(s.phase) * 60_000) s.completePhase()
    }, 1000)
    return () => clearInterval(id)
  }, [])
  // tab title shows the clock
  const v = useTimerView()
  useEffect(() => {
    document.title = v.active ? `${fmtClock(v.display)} · ${PHASE_LABEL[v.phase]}` : 'My Work Assistant'
  }, [v.active, v.display, v.phase])
}

export function TimerChip() {
  const v = useTimerView()
  const nav = useNavigate()
  if (!v.active) return null
  return (
    <button
      onClick={() => nav('/focus')}
      className={cn(
        'tabular flex h-9 items-center gap-2 rounded-lg px-3 font-mono text-sm font-bold transition',
        v.phase === 'focus' ? 'bg-primary text-primary-foreground' : 'bg-success text-white',
        !v.running && 'opacity-70',
      )}
      title="Mở chế độ tập trung"
    >
      {v.phase === 'focus' ? <TimerIcon className="size-4" /> : <Coffee className="size-4" />}
      {fmtClock(v.display)}
    </button>
  )
}

export function Ring({ progress, size = 220, stroke = 12, color = 'var(--primary)', children }: { progress: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function TimerControls({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const v = useTimerView()
  const tasks = useTasks() ?? []
  const task = tasks.find((t) => t.id === v.taskId)
  const s = size === 'sm' ? 'icon-sm' : 'icon'
  return (
    <div className="flex items-center justify-center gap-2">
      {!v.active ? (
        <Button size={size === 'sm' ? 'sm' : 'lg'} onClick={() => v.start()}>
          <Play /> Bắt đầu
        </Button>
      ) : (
        <>
          {v.running ? (
            <Button size={s} onClick={v.pause} title="Tạm dừng">
              <Pause />
            </Button>
          ) : (
            <Button size={s} onClick={v.resume} title="Tiếp tục">
              <Play />
            </Button>
          )}
          <Button size={s} variant="outline" onClick={v.skip} title={v.mode === 'pomodoro' ? 'Bỏ qua phase' : 'Lưu'}>
            <SkipForward />
          </Button>
          <Button size={s} variant="outline" onClick={v.stop} title="Dừng & lưu">
            <Square />
          </Button>
          {task && task.status !== 'done' && (
            <Button
              size={s}
              variant="outline"
              className="text-success"
              title="Hoàn thành task"
              onClick={() => {
                v.stop()
                void completeTask(task)
              }}
            >
              <Check />
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/** Compact UI used inside the always-on-top window */
export function MiniTimer() {
  const v = useTimerView()
  const tasks = useTasks() ?? []
  const task = tasks.find((t) => t.id === v.taskId)
  const today = dayKey()
  const upcoming = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== 'done' && t.id !== v.taskId && (t.plan?.some((b) => b.date === today) || t.scheduledDate === today || (t.deadline && t.deadline <= today)))
        .slice(0, 3),
    [tasks, v.taskId, today],
  )
  return (
    <div className="flex h-dvh flex-col gap-2 bg-background p-3 text-foreground">
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground uppercase">
        <span className={v.phase === 'focus' ? 'text-primary' : 'text-success'}>{PHASE_LABEL[v.phase]} {v.mode === 'stopwatch' && '· bấm giờ'}</span>
        <span>🍅 {v.cycles}</span>
      </div>
      <div className="line-clamp-2 text-sm font-semibold">{task?.title ?? 'Chưa chọn task'}</div>
      <div className="tabular text-center font-mono text-5xl font-bold tracking-tight" style={{ color: v.phase === 'focus' ? 'var(--primary)' : 'var(--success)' }}>
        {fmtClock(v.display)}
      </div>
      {v.total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${v.progress * 100}%` }} />
        </div>
      )}
      <TimerControls size="sm" />
      {upcoming.length > 0 && (
        <div className="mt-auto grid gap-1 border-t pt-2">
          {upcoming.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-xs">
              <button className="size-3.5 shrink-0 rounded-full border-2 hover:bg-success" onClick={() => void completeTask(t)} aria-label="Xong" />
              <button className="truncate text-left hover:text-primary" onClick={() => v.setTask(t.id)} title="Chuyển sang task này">
                {t.title}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MiniButton() {
  return (
    <Button variant="ghost" size="icon" onClick={() => void openMini()} title="Cửa sổ mini luôn nổi trên màn hình">
      <PictureInPicture2 />
    </Button>
  )
}
