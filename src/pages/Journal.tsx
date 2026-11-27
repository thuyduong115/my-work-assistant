import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { BookOpen, CalendarRange, ChevronLeft, ChevronRight, Columns2, Pencil, Plus, Square, Trash2, Type, X } from 'lucide-react'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useJournalRow, useJournals, useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import { createTask, GOALS_ID, journalId, monthId, saveJournal, updateGoals, updateJournal } from '@/db/actions'
import { DEFAULT_ROLE_ID } from '@/db/db'
import type { Journal, JournalBlock, JournalBullet } from '@/db/types'
import { useGCal } from '@/gcal/gcal'
import { parseDuration } from '@/ai/fallback'
import { BLOCK_KINDS, cleanTime, dayTasks, dayTime, fmtHM, lanes, mottoFor, timeline, type Mark, type Seg } from '@/lib/bujo'
import { completeTask } from '@/lib/celebrate'
import { fmtAmount, habitKind, habitUnit, isHabitDone, logValue } from '@/lib/habits'
import { habitActiveOn } from '@/lib/stats'
import { cn, dayKey, fromDayKey, minToHHMM, uid } from '@/lib/utils'
import { useUI } from '@/stores/ui'
import { tapHabit } from './Habits'
import { MOOD } from '@/components/Ritual'
import { AppIcon } from '@/components/AppIcon'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'

/* ------------------------------------------------------------------ prefs */

function usePref(key: string, initial: boolean) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key)
      return s === null ? initial : s === '1'
    } catch {
      return initial
    }
  })
  const set = (x: boolean) => {
    setV(x)
    try {
      localStorage.setItem(key, x ? '1' : '0')
    } catch {
      /* ignore */
    }
  }
  return [v, set] as const
}

/* ------------------------------------------------------------------ bits */

function H({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h3 className="bujo-h text-[1.15rem] leading-none font-bold">{children}</h3>
      {action}
    </div>
  )
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="no-print rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5">
      {children}
    </button>
  )
}

/** Input that saves on Enter / blur */
function LineInput({ value, onSave, placeholder, className }: { value?: string; onSave: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? '') && onSave(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={cn('w-full border-b border-dashed border-transparent bg-transparent outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-primary', className)}
    />
  )
}

/* ------------------------------------------------------------------ timeline */

const LANE = 24

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function SegRow({ segs, width, up, onPick }: { segs: Seg[]; width: number; up?: boolean; onPick: (s: Seg) => void }) {
  const ls = lanes(segs, width)
  const n = Math.max(1, ...ls.map((l) => l + 1))
  const px = width / 1440
  return (
    <div className="relative" style={{ height: n * LANE }}>
      {segs.map((s, i) => {
        const y = (up ? n - 1 - ls[i] : ls[i]) * LANE
        const w = Math.max(3, (s.end - s.start) * px)
        return (
          <button
            key={s.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPick(s)
            }}
            title={`${minToHHMM(s.start)}–${minToHHMM(s.end)} · ${s.label}`}
            className="group absolute flex flex-col items-start text-left"
            style={{ left: s.start * px, top: y, maxWidth: width - s.start * px }}
          >
            {up && <span className="max-w-[160px] truncate text-[11px] leading-[14px] opacity-85 group-hover:opacity-100">{s.label}</span>}
            <span
              className="relative block h-[7px] rounded-[2px]"
              style={{ width: w, background: s.planned ? 'transparent' : s.color, border: s.planned ? `1.5px dashed ${s.color}` : undefined }}
            >
              <span className="absolute -top-[3px] left-0 h-[13px] w-[1.5px] rounded" style={{ background: s.color }} />
              <span className="absolute -top-[3px] right-0 h-[13px] w-[1.5px] rounded" style={{ background: s.color }} />
            </span>
            {!up && <span className="max-w-[160px] truncate text-[11px] leading-[14px] opacity-85 group-hover:opacity-100">{s.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function DayTimeline({ planned, actual, onEmpty, onPick }: { planned: Seg[]; actual: Seg[]; onEmpty: (min: number) => void; onPick: (s: Seg) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const width = Math.max(w, 560)
  const px = width / 1440
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div ref={ref} className="min-w-[560px]">
        {planned.length > 0 && <SegRow segs={planned} width={width} up onPick={onPick} />}
        <div
          className="relative mt-1 h-7 cursor-copy"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            onEmpty(Math.max(0, Math.min(23 * 60, Math.round((e.clientX - r.left) / px / 30) * 30)))
          }}
          title="Bấm để thêm khối thời gian"
        >
          <div className="absolute inset-x-0 top-[13px] h-[1.5px] bg-foreground/70" />
          {Array.from({ length: 25 }, (_, h) => (
            <div key={h} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: h * 60 * px }}>
              <span className="text-[10px] leading-none text-muted-foreground tabular">{h}</span>
              <span className={cn('mt-[2px] w-px bg-foreground/60', h % 6 === 0 ? 'h-[9px]' : 'h-[5px] mt-[4px]')} />
            </div>
          ))}
          <div className="absolute top-[8px] h-[12px] w-[2px] rounded bg-destructive" style={{ left: nowMin * px }} title="Bây giờ" />
        </div>
        <SegRow segs={actual} width={width} onPick={onPick} />
      </div>
    </div>
  )
}

function BlockDialog({ date, block, startMin, onClose }: { date: string; block?: JournalBlock; startMin?: number; onClose: () => void }) {
  const [kind, setKind] = useState<JournalBlock['kind']>(block?.kind ?? 'sleep')
  const [label, setLabel] = useState(block?.label ?? '')
  const [start, setStart] = useState(block?.start ?? minToHHMM(startMin ?? 0))
  const [end, setEnd] = useState(block?.end ?? minToHHMM(Math.min(1440, (startMin ?? 0) + 60)))
  const save = async () => {
    const s = cleanTime(start)
    const e = cleanTime(end)
    if (!s || !e || e <= s) return toast.error('Giờ kết thúc phải sau giờ bắt đầu', { description: 'Khối qua nửa đêm: tách thành 2 ngày (VD 23:00–24:00 và 00:00–06:00).' })
    const next: JournalBlock = { id: block?.id ?? uid(), kind, label: label.trim(), start: s, end: e }
    await updateJournal(date, (j) => ({ blocks: [...(j?.blocks ?? []).filter((b) => b.id !== next.id), next].sort((a, b) => (a.start < b.start ? -1 : 1)) }))
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={block ? 'Sửa khối thời gian' : 'Thêm khối thời gian'}
      description="Những việc không đếm giờ trong app: ngủ, học trên lớp, ăn, di chuyển…"
      footer={
        <>
          {block && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await updateJournal(date, (j) => ({ blocks: (j?.blocks ?? []).filter((b) => b.id !== block.id) }))
                onClose()
              }}
            >
              <Trash2 /> Xoá
            </Button>
          )}
          <Button onClick={save}>Lưu</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BLOCK_KINDS) as JournalBlock['kind'][]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn('rounded-full border px-2.5 py-1 text-xs transition', kind === k ? 'border-transparent text-white' : 'hover:bg-muted')}
              style={kind === k ? { background: BLOCK_KINDS[k].color } : undefined}
            >
              {BLOCK_KINDS[k].icon} {BLOCK_KINDS[k].label}
            </button>
          ))}
        </div>
        <div>
          <Label>Ghi chú (tuỳ chọn)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={BLOCK_KINDS[kind].label} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Từ</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Đến</Label>
            <Input type="time" value={end === '24:00' ? '23:59' : end} onChange={(e) => setEnd(e.target.value === '23:59' ? '24:00' : e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ page */

const MARK_STYLE: Record<Mark, string> = { '•': '', '×': 'text-success', '>': 'text-warning', '△': 'text-sky-500' }
const BULLET_MARK: Record<JournalBullet['kind'], string> = { note: '–', event: '○', idea: '!' }

export function BujoPage({ date, narrow }: { date: string; narrow?: boolean }) {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const projects = useProjects()
  const roles = useRoles()
  const habits = useHabits()
  const logs = useHabitLogs()
  const journals = useJournals()
  const journal = useJournalRow(journalId(date))
  const goalsRow = useJournalRow(GOALS_ID)
  const events = useGCal((s) => s.events)
  const openTask = useUI((s) => s.openTask)
  const today = dayKey()
  const isFuture = date > today
  const [blockEdit, setBlockEdit] = useState<{ block?: JournalBlock; start?: number } | null>(null)
  const [editGoals, setEditGoals] = useState(false)
  const [newGoal, setNewGoal] = useState('')
  const [quick, setQuick] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [addText, setAddText] = useState('')

  const ownEvents = useMemo(() => events.filter((e) => !e.title.startsWith('✅')), [events])
  const tl = useMemo(() => timeline(date, { tasks, entries, projects, roles, events: ownEvents, journal }), [date, tasks, entries, projects, roles, ownEvents, journal])
  const items = useMemo(() => dayTasks(date, tasks, today), [date, tasks, today])
  const time = useMemo(() => dayTime(date, { tasks, entries, roles, journal }), [date, tasks, entries, roles, journal])
  const goals = (goalsRow?.goals ?? []).filter((g) => !g.archived)
  const dayHabits = habits.filter((h) => !h.archived && habitActiveOn(h, date))
  const pageNo = journals.filter((j) => j.date <= date).length + (journal ? 0 : 1)
  const top3 = new Set(journal?.top3 ?? [])
  const save = (patch: Partial<Journal>) => saveJournal(date, patch)

  const groups = useMemo(() => {
    const m = new Map<string, typeof items>()
    for (const it of items) {
      const k = it.task.roleId && roles.some((r) => r.id === it.task.roleId) ? it.task.roleId : ''
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(it)
    }
    return [...m.entries()].map(([id, list]) => ({ id, role: roles.find((r) => r.id === id), list }))
  }, [items, roles])

  const addTask = async (roleId: string, text: string) => {
    const [est, title] = parseDuration(text)
    if (!(title || text).trim()) return
    await createTask({ title: (title || text).trim(), roleId: roleId || DEFAULT_ROLE_ID, scheduledDate: date, estimateMin: est ?? 30 })
  }
  const addQuick = async () => {
    const t = quick.trim()
    if (!t) return
    const m = /^(-|–|o\s|○|!)\s*(.*)$/.exec(t)
    if (m) {
      const kind: JournalBullet['kind'] = m[1] === '!' ? 'idea' : m[1].startsWith('o') || m[1] === '○' ? 'event' : 'note'
      await updateJournal(date, (j) => ({ bullets: [...(j?.bullets ?? []), { id: uid(), kind, text: m[2].trim() }] }))
    } else await addTask(DEFAULT_ROLE_ID, t)
    setQuick('')
  }
  const toggleGoal = (id: string) =>
    void updateJournal(date, (j) => {
      const cur = new Set(j?.goalsDone ?? [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { goalsDone: [...cur] }
    })
  const schedule = [...tl.planned].sort((a, b) => a.start - b.start)
  const d = fromDayKey(date)

  return (
    <article className={cn('bujo-paper relative min-w-0 rounded-2xl border p-4 shadow-sm sm:p-6', narrow ? '' : 'min-h-[70vh]')}>
      {/* header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <LineInput value={journal?.title} onSave={(title) => save({ title })} placeholder={mottoFor(date)} className="bujo-h text-2xl font-bold sm:text-[1.7rem]" />
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold text-orange-500 tabular">{format(d, 'dd.MM.yyyy')}</div>
          <div className={cn('bujo-h text-lg leading-tight font-bold capitalize', date === today ? 'text-orange-500' : 'text-orange-500/80')}>{format(d, 'EEEE', { locale: vi })}</div>
          <div className="text-xs text-muted-foreground tabular">#{pageNo}</div>
        </div>
      </div>

      {/* summary */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="bujo-h text-[1.15rem] font-bold">Tổng kết</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={isFuture}
                onClick={() => save({ score: journal?.score === i + 1 ? undefined : i + 1 })}
                className={cn('grid size-6 place-items-center rounded-full border text-[11px] tabular transition', (journal?.score ?? 0) > i ? 'border-transparent bg-primary text-primary-foreground' : 'hover:border-primary disabled:opacity-40')}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {journal?.score ? <span className="text-sm font-semibold">{journal.score}/10</span> : null}
        </div>
        <div className="flex gap-0.5">
          {MOOD.map((m, i) => (
            <button key={i} type="button" disabled={isFuture} onClick={() => save({ mood: journal?.mood === i + 1 ? undefined : i + 1 })} className={cn('rounded-md px-0.5 text-lg transition', journal?.mood === i + 1 ? 'scale-125' : 'opacity-35 grayscale hover:opacity-80')}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* timeline */}
      <div className="mb-4">
        <DayTimeline
          planned={tl.planned}
          actual={tl.actual}
          onEmpty={(start) => setBlockEdit({ start })}
          onPick={(s) => {
            if (s.blockId) setBlockEdit({ block: journal?.blocks?.find((b) => b.id === s.blockId) })
            else if (s.taskId) openTask(s.taskId)
          }}
        />
        <div className="no-print mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className="mr-1 inline-block h-[6px] w-4 rounded-[2px] border-[1.5px] border-dashed border-muted-foreground align-middle" /> kế hoạch / lịch Google
          </span>
          <span>
            <span className="mr-1 inline-block h-[6px] w-4 rounded-[2px] bg-muted-foreground align-middle" /> thực tế (đếm giờ + khối bạn thêm)
          </span>
          <button type="button" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setBlockEdit({ start: 0 })}>
            <Plus className="size-3" /> Ngủ, học, ăn…
          </button>
        </div>
      </div>

      <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-5', !narrow && 'md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:gap-8')}>
        {/* left column: checklist + notes */}
        <div className="grid content-start gap-5">
          <section>
            <H>Checklist</H>
            {groups.length === 0 && !(journal?.bullets ?? []).length && <p className="text-sm text-muted-foreground">Chưa có việc cho ngày này.</p>}
            <div className="grid gap-3">
              {groups.map((g) => (
                <div key={g.id} className="grid grid-cols-[auto_1fr] gap-x-3">
                  <div className="flex w-16 flex-col items-center gap-0.5 border-r pr-2 pt-0.5 text-center">
                    <AppIcon value={g.role?.icon ?? '📌'} size={18} style={{ color: g.role?.color }} />
                    <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{g.role?.name ?? 'Khác'}</span>
                  </div>
                  <ul className="grid gap-0.5">
                    {g.list.map(({ task, mark, time }) => (
                      <li key={task.id} className="group flex items-baseline gap-2">
                        <button type="button" onClick={() => void completeTask(task)} title="Đánh dấu xong / chưa xong" className={cn('w-4 shrink-0 text-center font-mono text-base leading-none font-bold', MARK_STYLE[mark])}>
                          {mark}
                        </button>
                        <button type="button" onClick={() => openTask(task.id)} className={cn('min-w-0 flex-1 text-left text-[0.95rem] leading-snug hover:text-primary', mark === '×' && 'text-muted-foreground line-through decoration-1')}>
                          {top3.has(task.id) && <span className="mr-0.5 text-amber-500">★</span>}
                          {task.title}
                        </button>
                        {time && <span className="shrink-0 text-[11px] text-muted-foreground tabular">{time}</span>}
                      </li>
                    ))}
                    {adding === g.id ? (
                      <li>
                        <input
                          autoFocus
                          value={addText}
                          onChange={(e) => setAddText(e.target.value)}
                          onBlur={() => setAdding(null)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Escape') setAdding(null)
                            if (e.key === 'Enter' && addText.trim()) {
                              await addTask(g.id, addText)
                              setAddText('')
                            }
                          }}
                          placeholder="Tên việc (vd: Đọc bài 30p) ↵"
                          className="w-full border-b border-primary bg-transparent py-0.5 text-sm outline-none"
                        />
                      </li>
                    ) : (
                      <li className="no-print">
                        <button type="button" onClick={() => setAdding(g.id)} className="text-xs text-muted-foreground opacity-60 hover:text-primary hover:opacity-100">
                          + thêm
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
              {(journal?.bullets ?? []).length > 0 && (
                <ul className="grid gap-0.5 pl-[76px]">
                  {journal!.bullets!.map((b) => (
                    <li key={b.id} className="group flex items-baseline gap-2">
                      <span className={cn('w-4 shrink-0 text-center font-mono font-bold', b.kind === 'idea' && 'text-amber-500', b.kind === 'event' && 'text-sky-500')}>{BULLET_MARK[b.kind]}</span>
                      <span className="min-w-0 flex-1 text-[0.95rem] leading-snug">{b.text}</span>
                      <button type="button" aria-label="Xoá" onClick={() => void updateJournal(date, (j) => ({ bullets: (j?.bullets ?? []).filter((x) => x.id !== b.id) }))} className="no-print opacity-0 group-hover:opacity-100">
                        <X className="size-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="no-print mt-3">
              <input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addQuick()}
                placeholder="Ghi nhanh ↵   ( - ghi chú · o sự kiện · ! ý tưởng · còn lại = việc )"
                className="w-full rounded-lg border border-dashed bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">• việc · × xong · &gt; dời / chưa xong · △ đang làm · ★ việc chính · ○ sự kiện · – ghi chú · ! ý tưởng</p>
            </div>
          </section>

          <section>
            <H>Ghi chép</H>
            <div className="grid gap-2">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-sm">✨</span>
                <LineInput value={journal?.win} onSave={(win) => save({ win: win || undefined })} placeholder="Điều làm tốt hôm nay" className="text-[0.95rem]" />
              </div>
              <textarea
                key={journal?.note ?? ''}
                defaultValue={journal?.note ?? ''}
                onBlur={(e) => e.target.value.trim() !== (journal?.note ?? '') && void save({ note: e.target.value.trim() || undefined })}
                rows={3}
                placeholder="Suy nghĩ, bài học, điều muốn nhớ…"
                className="w-full resize-y rounded-lg border border-dashed bg-transparent px-3 py-2 text-[0.95rem] leading-relaxed outline-none focus:border-primary"
              />
            </div>
          </section>
        </div>

        {/* right column */}
        <div className="grid content-start gap-5">
          <section>
            <H action={<IconBtn label="Sửa danh sách mục tiêu" onClick={() => setEditGoals(!editGoals)}>{editGoals ? <X /> : <Pencil />}</IconBtn>}>Mục tiêu dài hạn</H>
            {editGoals ? (
              <div className="grid gap-1.5">
                {goals.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <LineInput value={g.name} onSave={(name) => name && void updateGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, name } : x)))} className="text-[0.95rem]" />
                    <IconBtn label="Bỏ mục tiêu" onClick={() => void updateGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, archived: true } : x)))}>
                      <Trash2 />
                    </IconBtn>
                  </div>
                ))}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!newGoal.trim()) return
                    const name = newGoal.trim()
                    void updateGoals((gs) => [...gs, { id: uid(), name }])
                    setNewGoal('')
                  }}
                >
                  <Input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="VD: AI – viết NCKH, Ngoại ngữ (Hàn/Trung), BA" className="h-8 text-sm" />
                  <Button size="sm" type="submit">
                    Thêm
                  </Button>
                </form>
              </div>
            ) : goals.length === 0 ? (
              <button type="button" onClick={() => setEditGoals(true)} className="text-sm text-muted-foreground hover:text-primary">
                + Thêm mục tiêu dài hạn (tick những ngày bạn có làm)
              </button>
            ) : (
              <ul className="grid gap-1">
                {goals.map((g) => {
                  const on = journal?.goalsDone?.includes(g.id)
                  return (
                    <li key={g.id}>
                      <button type="button" disabled={isFuture} onClick={() => toggleGoal(g.id)} className="flex items-center gap-2 text-left text-[0.95rem]">
                        <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border-[1.5px] text-[10px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/50')}>{on ? '✓' : ''}</span>
                        {g.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <H>Lịch trình</H>
            {schedule.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có lịch.</p>
            ) : (
              <ul className="grid gap-0.5">
                {schedule.map((s) => {
                  const done = s.taskId && tasks.find((t) => t.id === s.taskId)?.status === 'done'
                  return (
                    <li key={s.key} className="flex items-baseline gap-2 text-[0.95rem]">
                      <span className="w-[86px] shrink-0 text-[11px] text-muted-foreground tabular">
                        {minToHHMM(s.start)}–{minToHHMM(s.end)}
                      </span>
                      <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: s.color }} />
                      <button type="button" onClick={() => s.taskId && openTask(s.taskId)} className={cn('min-w-0 flex-1 truncate text-left', done && 'text-muted-foreground line-through')}>
                        {done && '✓ '}
                        {s.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section>
              <H>Theo dõi</H>
              {dayHabits.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="grid gap-1">
                  {dayHabits.map((h) => {
                    const v = logValue(logs, h, date)
                    const ok = isHabitDone(h, v) && (v > 0 || h.goal === 'atMost')
                    return (
                      <li key={h.id} className="flex items-center gap-1.5 text-[0.92rem]">
                        <button
                          type="button"
                          disabled={isFuture}
                          onClick={() => void tapHabit(h, logs, date)}
                          title={habitKind(h) === 'check' ? 'Tick' : 'Cộng thêm'}
                          className={cn('grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] text-[10px] disabled:opacity-40', ok ? 'border-transparent text-white' : 'border-foreground/50')}
                          style={ok ? { background: h.color } : undefined}
                        >
                          {ok ? '✓' : ''}
                        </button>
                        <span className="min-w-0 flex-1 truncate">{h.name}</span>
                        {habitKind(h) !== 'check' && <span className="shrink-0 text-xs text-muted-foreground tabular">{fmtAmount(v, habitUnit(h))}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section>
              <H>Thời gian</H>
              <ul className="grid gap-0.5 text-[0.92rem]">
                <li className="flex justify-between gap-2">
                  <span>😴 Ngủ</span>
                  <b className="tabular">{fmtHM(time.byKind.get('sleep') ?? 0)}</b>
                </li>
                {[...time.byKind.entries()]
                  .filter(([k]) => k !== 'sleep')
                  .map(([k, m]) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span className="truncate">
                        {BLOCK_KINDS[k].icon} {BLOCK_KINDS[k].label}
                      </span>
                      <b className="tabular">{fmtHM(m)}</b>
                    </li>
                  ))}
                {time.roles.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="mr-1 inline-block size-2 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <b className="tabular">{fmtHM(r.min)}</b>
                  </li>
                ))}
                <li className="mt-1 flex justify-between gap-2 border-t border-dashed pt-1">
                  <span>⏱ Tập trung</span>
                  <b className="tabular">{fmtHM(time.focus)}</b>
                </li>
                <li className="flex justify-between gap-2">
                  <span>✅ Việc xong</span>
                  <b className="tabular">{items.filter((i) => i.mark === '×').length}</b>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>

      {blockEdit && <BlockDialog date={date} block={blockEdit.block} startMin={blockEdit.start} onClose={() => setBlockEdit(null)} />}
    </article>
  )
}

/* ------------------------------------------------------------------ route */

export default function JournalPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const today = dayKey()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') ?? '') ? params.get('d')! : today
  const [spread, setSpread] = usePref('mwa-bujo-spread', true)
  const [hand, setHand] = usePref('mwa-bujo-hand', true)
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const fn = () => setWide(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  const go = (d: string) => setParams(d === today ? {} : { d })
  const shift = (n: number) => go(dayKey(addDays(fromDayKey(date), n)))
  const two = spread && wide
  const prevMonth = format(addDays(new Date(`${today.slice(0, 8)}01T00:00`), -1), 'yyyy-MM')
  const prevReview = useJournalRow(monthId(prevMonth))
  const showMonthNudge = Number(today.slice(8)) <= 5 && prevReview === null

  return (
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4', hand && 'font-hand')}>
      <div className="no-print flex flex-wrap items-center gap-2">
        <h1 className="mr-2 flex items-center gap-2 font-sans text-2xl font-bold tracking-tight">
          <BookOpen className="size-6 text-primary" /> Bullet Journal
        </h1>
        <div className="flex items-center gap-1 font-sans">
          <Button size="icon-sm" variant="outline" onClick={() => shift(two ? -2 : -1)} aria-label="Trang trước">
            <ChevronLeft />
          </Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="h-8 w-[150px] text-sm" />
          <Button size="icon-sm" variant="outline" onClick={() => shift(two ? 2 : 1)} aria-label="Trang sau">
            <ChevronRight />
          </Button>
          {date !== today && (
            <Button size="sm" variant="ghost" onClick={() => go(today)}>
              Hôm nay
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 font-sans">
          {wide && (
            <Button size="sm" variant={spread ? 'soft' : 'ghost'} onClick={() => setSpread(!spread)} title="Hiện 2 ngày cạnh nhau như cuốn sổ">
              {spread ? <Columns2 /> : <Square />} {spread ? '2 trang' : '1 trang'}
            </Button>
          )}
          <Button size="sm" variant={hand ? 'soft' : 'ghost'} onClick={() => setHand(!hand)} title="Chữ viết tay">
            <Type /> Viết tay
          </Button>
          <Button size="sm" onClick={() => nav(`/journal/month?m=${date.slice(0, 7)}`)}>
            <CalendarRange /> Tổng kết tháng
          </Button>
        </div>
      </div>

      {showMonthNudge && (
        <Link to={`/journal/month?m=${prevMonth}`} className="no-print flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-soft/60 p-3 font-sans text-sm hover:border-primary">
          <CalendarRange className="size-5 shrink-0 text-primary" />
          <span className="flex-1">
            <b>Tháng {Number(prevMonth.slice(5))} đã qua</b> — xem lại cả tháng và ghi tổng kết (5 phút).
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      {two ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-0 rounded-2xl shadow-[0_0_0_1px_var(--border)]">
          <div className="[&>article]:rounded-r-none [&>article]:border-r-0">
            <BujoPage date={dayKey(addDays(fromDayKey(date), -1))} narrow />
          </div>
          <div className="relative [&>article]:rounded-l-none">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-black/10 to-transparent dark:from-black/40" />
            <BujoPage date={date} narrow />
          </div>
        </div>
      ) : (
        <BujoPage date={date} />
      )}
    </div>
  )
}
