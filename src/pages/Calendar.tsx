import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, getDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { vi } from 'date-fns/locale'
import { AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Flag, List, Loader2, Pin, Rows3, Wand2, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useProjects, useTasks, useTimeEntries } from '@/db/hooks'
import { updateTask } from '@/db/actions'
import { putMany } from '@/db/db'
import { PRIORITY_COLOR, type PlanBlock, type Task } from '@/db/types'
import { leafTasks } from '@/lib/scheduler'
import { runSchedule, useSchedule } from '@/lib/autoSchedule'
import { cn, dayKey, fmtMin, fromDayKey, hhmmToMin, minToHHMM } from '@/lib/utils'
import { parseSlots, useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { useNow } from '@/lib/useNow'
import { eventsOn, useGCal, type GEvent } from '@/gcal/gcal'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/misc'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'

type View = 'day' | 'week' | 'month' | 'agenda'
const H0 = 6
const H1 = 24
const PX = 52 // px per hour
const SNAP = 15
const MIME = 'application/x-mwa'

interface DragData {
  taskId: string
  blockIdx: number
  offsetMin: number
}

function useTaskColor() {
  const projects = useProjects()
  return (t: Task) => projects.find((p) => p.id === t.projectId)?.color ?? PRIORITY_COLOR[t.priority]
}

async function moveBlock(task: Task, d: DragData, date: string, startMin: number | null) {
  const maxBlock = useSettings.getState().maxBlockMin
  const plan = [...(task.plan ?? [])]
  if (d.blockIdx >= 0 && plan[d.blockIdx]) {
    const b = plan[d.blockIdx]
    plan[d.blockIdx] = { ...b, date, start: startMin === null ? b.start : minToHHMM(startMin) }
  } else {
    const slots = parseSlots(useSettings.getState().workHours[getDay(fromDayKey(date))] ?? '')
    const start = startMin ?? slots[0]?.[0] ?? 9 * 60
    // drop from the backlog: replace future auto blocks with this one
    const keep = plan.filter((b) => b.date < dayKey())
    keep.push({ date, start: minToHHMM(start), min: Math.min(task.estimateMin, maxBlock) })
    plan.splice(0, plan.length, ...keep)
  }
  plan.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1))
  await updateTask(task.id, { plan, pinned: true })
}

function layoutDay(blocks: { task: Task; block: PlanBlock; idx: number }[]) {
  const items = blocks
    .map((b) => ({ ...b, s: hhmmToMin(b.block.start), e: hhmmToMin(b.block.start) + b.block.min, lane: 0, lanes: 1 }))
    .sort((a, b) => a.s - b.s)
  const active: typeof items = []
  let cluster: typeof items = []
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1))
    cluster.forEach((c) => (c.lanes = n))
    cluster = []
  }
  for (const it of items) {
    for (let i = active.length - 1; i >= 0; i--) if (active[i].e <= it.s) active.splice(i, 1)
    if (active.length === 0) flush()
    const used = new Set(active.map((a) => a.lane))
    let lane = 0
    while (used.has(lane)) lane++
    it.lane = lane
    active.push(it)
    cluster.push(it)
  }
  flush()
  return items
}

const fmtT = (ms: number) => new Date(ms).toTimeString().slice(0, 5)

function GChip({ e, className }: { e: GEvent; className?: string }) {
  return (
    <a
      href={e.link}
      target="_blank"
      rel="noreferrer"
      title={`Google Calendar: ${e.title}${e.allDay ? '' : ` (${fmtT(e.start)}–${fmtT(e.end)})`}`}
      className={cn('flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium', className)}
      style={{ background: `color-mix(in oklch, ${e.color} 22%, transparent)`, color: 'var(--foreground)' }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
      <span className="truncate">{e.allDay ? '' : fmtT(e.start) + ' '}{e.title}</span>
    </a>
  )
}

function TimeGrid({ days, tasks }: { days: Date[]; tasks: Task[] }) {
  const gEvents = useGCal((s) => s.events)
  const { workHours } = useSettings()
  const entries = useTimeEntries()
  const color = useTaskColor()
  const openTask = useUI((s) => s.openTask)
  const createTask = useUI((s) => s.createTask)
  const now = useNow(60_000)
  const scroller = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState<{ taskId: string; idx: number; min: number } | null>(null)
  const [dropHint, setDropHint] = useState<{ k: string; min: number } | null>(null)

  useEffect(() => {
    const h = new Date().getHours()
    scroller.current?.scrollTo({ top: Math.max(0, (Math.min(h, 20) - H0 - 1) * PX) })
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, { task: Task; block: PlanBlock; idx: number }[]>()
    for (const t of tasks) t.plan?.forEach((block, idx) => {
      if (!m.has(block.date)) m.set(block.date, [])
      m.get(block.date)!.push({ task: t, block, idx })
    })
    return m
  }, [tasks])

  const deadlines = (k: string) => tasks.filter((t) => t.deadline === k && t.status !== 'done')
  const yToMin = (y: number) => Math.round((H0 * 60 + (y / PX) * 60) / SNAP) * SNAP

  const onDrop = (e: DragEvent<HTMLDivElement>, k: string) => {
    e.preventDefault()
    setDropHint(null)
    const raw = e.dataTransfer.getData(MIME)
    if (!raw) return
    const d = JSON.parse(raw) as DragData
    const task = tasks.find((t) => t.id === d.taskId)
    if (!task) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = Math.max(H0 * 60, Math.min(H1 * 60 - SNAP, yToMin(e.clientY - rect.top) - d.offsetMin))
    void moveBlock(task, d, k, Math.round(min / SNAP) * SNAP)
  }

  const startResize = (e: React.PointerEvent, task: Task, idx: number) => {
    e.stopPropagation()
    e.preventDefault()
    const startY = e.clientY
    const base = task.plan![idx].min
    let cur = base
    const move = (ev: PointerEvent) => {
      cur = Math.max(SNAP, Math.round((base + ((ev.clientY - startY) / PX) * 60) / SNAP) * SNAP)
      setResizing({ taskId: task.id, idx, min: cur })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setResizing(null)
      if (cur !== base) {
        const plan = task.plan!.map((b, i) => (i === idx ? { ...b, min: cur } : b))
        void updateTask(task.id, { plan, pinned: true })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const cols = `52px repeat(${days.length}, minmax(${days.length > 1 ? 96 : 200}px, 1fr))`

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: days.length > 1 ? 52 + days.length * 96 : undefined }}>
          {/* header */}
          <div className="grid border-b" style={{ gridTemplateColumns: cols }}>
            <div />
            {days.map((d) => {
              const k = dayKey(d)
              const isT = k === dayKey()
              const dl = deadlines(k)
              return (
                <div key={k} className="min-w-0 border-l px-1.5 py-2">
                  <div className={cn('text-center text-xs font-medium capitalize', isT ? 'text-primary' : 'text-muted-foreground')}>{format(d, 'EEE', { locale: vi })}</div>
                  <div className={cn('mx-auto mt-0.5 grid size-8 place-items-center rounded-full text-base font-bold', isT && 'bg-primary text-primary-foreground')}>{format(d, 'd')}</div>
                  <div className="mt-1 grid gap-0.5">
                    {eventsOn(gEvents, k)
                      .filter((e) => e.allDay)
                      .map((e) => (
                        <GChip key={e.id} e={e} />
                      ))}
                    {dl.slice(0, 3).map((t) => (
                      <button key={t.id} onClick={() => openTask(t.id)} className="flex items-center gap-1 truncate rounded bg-destructive/10 px-1 py-0.5 text-left text-[10px] font-medium text-destructive">
                        <Flag className="size-2.5 shrink-0" />
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                    {dl.length > 3 && <span className="text-center text-[10px] text-muted-foreground">+{dl.length - 3}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {/* body */}
          <div ref={scroller} className="relative max-h-[68vh] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: cols, height: (H1 - H0) * PX }}>
              <div className="relative">
                {Array.from({ length: H1 - H0 }, (_, i) => (
                  <div key={i} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground tabular" style={{ top: i * PX }}>
                    {i > 0 ? `${H0 + i}:00` : ''}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const k = dayKey(d)
                const slots = parseSlots(workHours[getDay(d)] ?? '')
                const items = layoutDay(byDay.get(k) ?? [])
                const actual = entries.filter((en) => dayKey(new Date(en.start)) === k)
                return (
                  <div
                    key={k}
                    className="relative border-l"
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(MIME)) return
                      e.preventDefault()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setDropHint({ k, min: yToMin(e.clientY - rect.top) })
                    }}
                    onDragLeave={() => setDropHint(null)}
                    onDrop={(e) => onDrop(e, k)}
                    onDoubleClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const min = yToMin(e.clientY - rect.top)
                      createTask({ plan: [{ date: k, start: minToHHMM(min), min: 30 }], pinned: true, scheduledDate: k })
                    }}
                  >
                    {Array.from({ length: H1 - H0 }, (_, i) => (
                      <div key={i} className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: i * PX }} />
                    ))}
                    {slots.map(([a, b], i) => (
                      <div key={i} className="absolute inset-x-0 bg-primary/[.06]" style={{ top: ((a - H0 * 60) / 60) * PX, height: ((b - a) / 60) * PX }} />
                    ))}
                    {actual.map((en) => {
                      const s = new Date(en.start)
                      const sm = s.getHours() * 60 + s.getMinutes()
                      return <div key={en.id} title="Thời gian làm thực tế" className="absolute right-0 w-1 rounded-full bg-success" style={{ top: ((sm - H0 * 60) / 60) * PX, height: Math.max(3, ((en.end - en.start) / 3_600_000) * PX) }} />
                    })}
                    {eventsOn(gEvents, k)
                      .filter((e) => !e.allDay)
                      .map((e) => {
                        const dayStart = new Date(`${k}T00:00`).getTime()
                        const sm = Math.max(H0 * 60, (Math.max(e.start, dayStart) - dayStart) / 60000)
                        const em = Math.min(H1 * 60, (Math.min(e.end, dayStart + 86_400_000) - dayStart) / 60000)
                        if (em <= sm) return null
                        return (
                          <a
                            key={e.id}
                            href={e.link}
                            target="_blank"
                            rel="noreferrer"
                            onDoubleClick={(ev) => ev.stopPropagation()}
                            title={`Google Calendar: ${e.title} (${fmtT(e.start)}–${fmtT(e.end)})`}
                            className="absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed px-1.5 py-0.5 text-[11px] leading-tight"
                            style={{
                              top: ((sm - H0 * 60) / 60) * PX + 1,
                              height: Math.max(16, ((em - sm) / 60) * PX - 2),
                              borderColor: e.color,
                              background: `repeating-linear-gradient(135deg, color-mix(in oklch, ${e.color} 14%, var(--card)) 0 6px, color-mix(in oklch, ${e.color} 6%, var(--card)) 6px 12px)`,
                            }}
                          >
                            <div className="truncate font-semibold">📅 {e.title}</div>
                            {em - sm >= 40 && <div className="text-muted-foreground tabular">{fmtT(e.start)}–{fmtT(e.end)}</div>}
                          </a>
                        )
                      })}
                    {dropHint?.k === k && <div className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-primary" style={{ top: ((dropHint.min - H0 * 60) / 60) * PX, height: PX / 2 }} />}
                    {items.map((it) => {
                      const min = resizing && resizing.taskId === it.task.id && resizing.idx === it.idx ? resizing.min : it.block.min
                      const c = color(it.task)
                      const done = it.task.status === 'done'
                      return (
                        <div
                          key={it.task.id + it.idx}
                          draggable
                          onDragStart={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const offsetMin = Math.round((((e.clientY - rect.top) / PX) * 60) / SNAP) * SNAP
                            e.dataTransfer.setData(MIME, JSON.stringify({ taskId: it.task.id, blockIdx: it.idx, offsetMin } satisfies DragData))
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onClick={() => openTask(it.task.id)}
                          onDoubleClick={(e) => e.stopPropagation()}
                          className={cn('group absolute cursor-grab overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] leading-tight shadow-xs transition hover:z-10 hover:shadow-md active:cursor-grabbing', done && 'opacity-50')}
                          style={{
                            top: ((it.s - H0 * 60) / 60) * PX + 1,
                            height: Math.max(18, (min / 60) * PX - 2),
                            left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
                            width: `calc(${100 / it.lanes}% - 6px)`,
                            borderColor: c,
                            background: `color-mix(in oklch, ${c} 18%, var(--card))`,
                          }}
                        >
                          <div className={cn('flex items-start gap-1 font-semibold', done && 'line-through')}>
                            {it.task.pinned && <Pin className="mt-px size-2.5 shrink-0 opacity-60" />}
                            <span className="line-clamp-2">{it.task.title}</span>
                          </div>
                          {min >= 40 && (
                            <div className="text-muted-foreground tabular">
                              {it.block.start}–{minToHHMM(it.s + min)}
                            </div>
                          )}
                          <div onPointerDown={(e) => startResize(e, it.task, it.idx)} onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100" style={{ background: `linear-gradient(transparent, ${c})` }} />
                        </div>
                      )
                    })}
                    {k === dayKey() && nowMin >= H0 * 60 && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((nowMin - H0 * 60) / 60) * PX }}>
                        <span className="-ml-1 size-2 rounded-full bg-destructive" />
                        <span className="h-0.5 flex-1 bg-destructive" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function MonthGrid({ cursor, tasks, onPickDay }: { cursor: Date; tasks: Task[]; onPickDay: (d: Date) => void }) {
  const gEvents = useGCal((s) => s.events)
  const color = useTaskColor()
  const openTask = useUI((s) => s.openTask)
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const [over, setOver] = useState<string | null>(null)

  const onDrop = (e: DragEvent, k: string) => {
    e.preventDefault()
    setOver(null)
    const raw = e.dataTransfer.getData(MIME)
    if (!raw) return
    const d = JSON.parse(raw) as DragData
    const task = tasks.find((t) => t.id === d.taskId)
    if (!task) return
    if (d.blockIdx === -2) void updateTask(task.id, { deadline: k })
    else void moveBlock(task, d, k, null)
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const k = dayKey(d)
          const blocks = tasks.flatMap((t) => (t.plan ?? []).map((b, idx) => ({ t, b, idx })).filter((x) => x.b.date === k))
          const dls = tasks.filter((t) => t.deadline === k && t.status !== 'done')
          const total = blocks.reduce((s, x) => s + x.b.min, 0)
          return (
            <div
              key={k}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(k)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, k)}
              className={cn('min-h-28 border-r border-b p-1.5 transition', !isSameMonth(d, cursor) && 'bg-muted/40 opacity-60', over === k && 'bg-primary-soft')}
            >
              <div className="mb-1 flex items-center justify-between">
                <button onClick={() => onPickDay(d)} className={cn('grid size-6 place-items-center rounded-full text-xs font-semibold hover:bg-muted', k === dayKey() && 'bg-primary text-primary-foreground hover:bg-primary')}>
                  {format(d, 'd')}
                </button>
                {total > 0 && <span className="text-[10px] text-muted-foreground">{fmtMin(total)}</span>}
              </div>
              <div className="grid gap-0.5">
                {eventsOn(gEvents, k)
                  .slice(0, 3)
                  .map((e) => (
                    <GChip key={e.id} e={e} />
                  ))}
                {dls.map((t) => (
                  <button
                    key={'d' + t.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ taskId: t.id, blockIdx: -2, offsetMin: 0 }))}
                    onClick={() => openTask(t.id)}
                    className="flex items-center gap-1 truncate rounded bg-destructive/10 px-1 py-0.5 text-left text-[10px] font-medium text-destructive"
                  >
                    <Flag className="size-2.5 shrink-0" /> <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {blocks.slice(0, 4).map(({ t, b, idx }) => (
                  <button
                    key={t.id + idx}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ taskId: t.id, blockIdx: idx, offsetMin: 0 }))}
                    onClick={() => openTask(t.id)}
                    className={cn('truncate rounded px-1 py-0.5 text-left text-[10px] font-medium', t.status === 'done' && 'line-through opacity-50')}
                    style={{ background: `color-mix(in oklch, ${color(t)} 18%, transparent)` }}
                  >
                    {b.start} {t.title}
                  </button>
                ))}
                {blocks.length > 4 && (
                  <button onClick={() => onPickDay(d)} className="text-left text-[10px] text-muted-foreground hover:text-primary">
                    +{blocks.length - 4} nữa
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Agenda({ tasks }: { tasks: Task[] }) {
  const gEvents = useGCal((s) => s.events)
  const openTask = useUI((s) => s.openTask)
  const color = useTaskColor()
  const days = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i))
  return (
    <div className="grid gap-3">
      {days.map((d) => {
        const k = dayKey(d)
        const blocks = tasks.flatMap((t) => (t.plan ?? []).filter((b) => b.date === k).map((b) => ({ t, b }))).sort((a, b) => (a.b.start < b.b.start ? -1 : 1))
        const dls = tasks.filter((t) => t.deadline === k && t.status !== 'done')
        const gev = eventsOn(gEvents, k)
        if (!blocks.length && !dls.length && !gev.length) return null
        return (
          <Card key={k} className="p-4">
            <div className="mb-2 flex items-baseline gap-2">
              <span className={cn('text-lg font-bold', k === dayKey() && 'text-primary')}>{format(d, 'dd/MM')}</span>
              <span className="text-sm text-muted-foreground capitalize">{format(d, 'EEEE', { locale: vi })}</span>
              <span className="ml-auto text-xs text-muted-foreground">{fmtMin(blocks.reduce((s, x) => s + x.b.min, 0))}</span>
            </div>
            <div className="grid gap-1">
              {dls.map((t) => (
                <button key={'d' + t.id} onClick={() => openTask(t.id)} className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-destructive hover:bg-muted">
                  <Flag className="size-3.5" /> Deadline: {t.title}
                </button>
              ))}
              {gev.map((e) => (
                <a key={e.id} href={e.link} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular">{e.allDay ? 'Cả ngày' : `${fmtT(e.start)}–${fmtT(e.end)}`}</span>
                  <span className="h-4 w-1 rounded-full" style={{ background: e.color }} />
                  <span className="truncate">📅 {e.title}</span>
                </a>
              ))}
              {blocks.map(({ t, b }, i) => (
                <button key={t.id + i} onClick={() => openTask(t.id)} className="flex items-center gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-muted">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular">
                    {b.start}–{minToHHMM(hhmmToMin(b.start) + b.min)}
                  </span>
                  <span className="h-4 w-1 rounded-full" style={{ background: color(t) }} />
                  <span className={cn('truncate', t.status === 'done' && 'line-through opacity-50')}>{t.title}</span>
                </button>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Backlog({ tasks }: { tasks: Task[] }) {
  const openTask = useUI((s) => s.openTask)
  const today = dayKey()
  const list = leafTasks(tasks).filter((t) => t.status !== 'done' && !t.plan?.some((b) => b.date >= today))
  const risks = useSchedule((s) => s.risks)
  return (
    <div className="grid content-start gap-4">
      <Card className="p-3">
        <div className="mb-2 text-sm font-semibold">Chưa xếp lịch ({list.length})</div>
        <p className="mb-2 text-[11px] text-muted-foreground">Kéo thả vào lịch. Nhấp đúp vào ô trống để tạo task.</p>
        <div className="grid max-h-[50vh] gap-1 overflow-y-auto">
          {list.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">Tất cả đã có lịch ✨</p>}
          {list.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ taskId: t.id, blockIdx: -1, offsetMin: 0 } satisfies DragData))}
              onClick={() => openTask(t.id)}
              className="flex cursor-grab items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 text-xs hover:border-primary/40"
            >
              <GripVertical className="size-3 shrink-0 text-muted-foreground" />
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
              <span className="flex-1 truncate">{t.title}</span>
              <span className="text-muted-foreground">{fmtMin(t.estimateMin)}</span>
            </div>
          ))}
        </div>
      </Card>
      {risks.length > 0 && (
        <Card className="border-destructive/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Nguy cơ trễ hạn
          </div>
          {risks.map((r) => {
            const t = tasks.find((x) => x.id === r.taskId)
            if (!t) return null
            return (
              <button key={r.taskId} onClick={() => openTask(t.id)} className="block w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted">
                {t.title} <span className="text-destructive">−{fmtMin(r.shortMin)}</span>
              </button>
            )
          })}
        </Card>
      )}
    </div>
  )
}

export default function Calendar() {
  const tasks = useTasks() ?? []
  const [view, setView] = useState<View>(() => (localStorage.getItem('mwa-cal-view') as View) || (innerWidth < 768 ? 'day' : 'week'))
  const [cursor, setCursor] = useState(new Date())
  const [busy, setBusy] = useState(false)
  useEffect(() => localStorage.setItem('mwa-cal-view', view), [view])

  const days = view === 'day' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, { weekStartsOn: 1 }), i))
  const step = (n: number) => setCursor(view === 'day' ? addDays(cursor, n) : view === 'month' ? addMonths(cursor, n) : addWeeks(cursor, n))
  const title =
    view === 'month' ? format(cursor, 'MMMM yyyy', { locale: vi }) : view === 'day' ? format(cursor, 'EEEE, dd/MM/yyyy', { locale: vi }) : view === 'agenda' ? '14 ngày tới' : `${format(days[0], 'dd/MM')} – ${format(days[6], 'dd/MM/yyyy')}`

  const auto = async (reset = false) => {
    setBusy(true)
    try {
      if (reset) await putMany('tasks', tasks.filter((t) => t.pinned && t.status !== 'done').map((t) => ({ id: t.id, pinned: false })))
      const r = await runSchedule()
      if (r.risks.length) toast.warning(`Đã xếp lịch · ${r.risks.length} task có nguy cơ trễ hạn`, { description: 'Xem danh sách bên trái hoặc thêm giờ làm việc trong Cài đặt.' })
      else toast.success('Đã xếp lịch tự động', { description: `${r.changed} task được cập nhật theo deadline & ước lượng.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold tracking-tight capitalize">{title}</h1>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => step(-1)} aria-label="Trước">
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Hôm nay
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => step(1)} aria-label="Sau">
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: <><Rows3 /> Ngày</> },
              { value: 'week', label: <><CalendarRange /> Tuần</> },
              { value: 'month', label: <><CalendarDays /> Tháng</> },
              { value: 'agenda', label: <><List /> Agenda</> },
            ]}
          />
          <Dropdown
            trigger={
              <Button disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Wand2 />} Xếp lịch tự động
              </Button>
            }
          >
            <DropdownItem onSelect={() => void auto(false)}>
              <Wand2 /> Xếp các task chưa ghim
            </DropdownItem>
            <DropdownItem onSelect={() => void auto(true)}>
              <Pin /> Xếp lại tất cả (bỏ ghim)
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
      <div className={cn('grid gap-4', view !== 'agenda' && 'lg:grid-cols-[240px_1fr]')}>
        {view !== 'agenda' && (
          <div className="hidden lg:block">
            <Backlog tasks={tasks} />
          </div>
        )}
        {view === 'month' ? (
          <MonthGrid
            cursor={cursor}
            tasks={tasks}
            onPickDay={(d) => {
              setCursor(d)
              setView('day')
            }}
          />
        ) : view === 'agenda' ? (
          <Agenda tasks={tasks} />
        ) : (
          <TimeGrid days={days} tasks={tasks} />
        )}
      </div>
    </div>
  )
}
