import { useMemo, useState } from 'react'
import { addDays, format, getDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Check, Flame, Minus, Pencil, Plus, Repeat2, RotateCcw, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { put, remove } from '@/db/db'
import { useHabitLogs, useHabits } from '@/db/hooks'
import type { Habit, HabitKind, HabitLog } from '@/db/types'
import { bestStreak, habitActiveOn, habitStreak } from '@/lib/stats'
import { HABIT_TEMPLATES, KIND_LABEL, fmtAmount, habitKind, habitProgress, habitStep, habitTarget, habitUnit, isHabitDone, logValue } from '@/lib/habits'
import { COLORS, cn, dayKey, fmtDay, uid } from '@/lib/utils'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Empty, PageHeader, Segmented, Stat } from '@/components/ui/misc'
import { Heatmap } from '@/components/Heatmap'
import { AppIcon } from '@/components/AppIcon'
import { IconPicker } from '@/components/IconPicker'

const logId = (habitId: string, date: string) => `${habitId}_${date}`

/** Set the day's value for a habit, celebrating when the goal is first reached */
export async function setHabitValue(h: Habit, logs: HabitLog[], date: string, value: number) {
  const prev = logValue(logs, h, date)
  const next = Math.max(0, Math.round(value * 100) / 100)
  await put('habitLogs', { id: logId(h.id, date), habitId: h.id, date, count: next, deleted: 0 })
  if (h.goal !== 'atMost' && isHabitDone(h, next) && !isHabitDone(h, prev)) {
    void confetti({ particleCount: 40, spread: 60, scalar: 0.7, origin: { y: 0.6 }, colors: [h.color, '#facc15'], disableForReducedMotion: true })
    const s = habitStreak(h, [...logs.filter((l) => !(l.habitId === h.id && l.date === date)), { habitId: h.id, date, count: next } as HabitLog])
    toast.success(`${h.name} — hoàn thành!`, { description: s > 1 ? `Chuỗi ${s} ngày 🔥` : 'Tốt lắm!' })
  }
  if (h.goal === 'atMost' && !isHabitDone(h, next) && isHabitDone(h, prev)) toast.warning(`${h.name}: vượt mức ${fmtAmount(habitTarget(h), habitUnit(h))} rồi!`)
}

/** One tap: tick/untick for check habits, + step for the others */
export function tapHabit(h: Habit, logs: HabitLog[], date = dayKey()) {
  const v = logValue(logs, h, date)
  if (habitKind(h) === 'check') return setHabitValue(h, logs, date, v >= 1 ? 0 : 1)
  return setHabitValue(h, logs, date, v + habitStep(h))
}

function ProgressRing({ value, color, size = 32, children }: { value: number; color: string; size?: number; children?: React.ReactNode }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold">{children}</span>
    </span>
  )
}

/** Log a value for any day: quick buttons, −/+, exact input, reset */
function LogDialog({ h, date, logs, onClose }: { h: Habit; date: string; logs: HabitLog[]; onClose: () => void }) {
  const v = logValue(logs, h, date)
  const unit = habitUnit(h)
  const step = habitStep(h)
  const [input, setInput] = useState('')
  const quick = [...new Set([step, ...(h.quick ?? [])])].filter((x) => x > 0).sort((a, b) => a - b)
  const done = isHabitDone(h, v)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={h.name} description={fmtDay(date, "EEEE, dd/MM")}>
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl" style={{ background: `color-mix(in oklch, ${h.color} 18%, transparent)`, color: h.color }}>
            <AppIcon value={h.icon} size={30} />
          </span>
          <div>
            <div className="text-3xl font-bold tabular">{fmtAmount(v, unit)}</div>
            <div className={cn('text-sm', done ? 'text-success' : 'text-muted-foreground')}>
              {h.goal === 'atMost' ? `Tối đa ${fmtAmount(habitTarget(h), unit)}` : `Mục tiêu ${fmtAmount(habitTarget(h), unit)}`} · {done ? (h.goal === 'atMost' ? 'trong mức ✓' : 'đã đạt ✓') : h.goal === 'atMost' ? 'vượt mức!' : `còn ${fmtAmount(habitTarget(h) - v, unit)}`}
            </div>
          </div>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${habitProgress(h, v) * 100}%`, background: h.goal === 'atMost' && !done ? 'var(--destructive)' : h.color }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setHabitValue(h, logs, date, v - step)} disabled={v <= 0}>
            <Minus /> {fmtAmount(step, unit)}
          </Button>
          {quick.map((q) => (
            <Button key={q} onClick={() => setHabitValue(h, logs, date, v + q)} style={{ background: h.color }}>
              <Plus /> {fmtAmount(q, unit)}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = parseFloat(input.replace(',', '.'))
            if (!isNaN(n)) void setHabitValue(h, logs, date, v + n)
            setInput('')
          }}
        >
          <Input type="number" step="any" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Thêm số tuỳ ý (${unit || 'đơn vị'}), số âm để bớt`} />
          <Button type="submit" variant="soft">
            Cộng
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const n = parseFloat(input.replace(',', '.'))
              if (!isNaN(n)) void setHabitValue(h, logs, date, n)
              setInput('')
            }}
          >
            Đặt bằng
          </Button>
        </form>
        <Button variant="ghost" className="justify-self-start text-muted-foreground" onClick={() => setHabitValue(h, logs, date, 0)}>
          <RotateCcw /> Đặt lại về 0
        </Button>
      </div>
    </Dialog>
  )
}

function HabitRow({ h, logs, onOpen }: { h: Habit; logs: HabitLog[]; onOpen: () => void }) {
  const today = dayKey()
  const v = logValue(logs, h, today)
  const kind = habitKind(h)
  const ok = isHabitDone(h, v)
  const reached = h.goal === 'atMost' ? !ok : ok
  const s = habitStreak(h, logs)
  const unit = habitUnit(h)
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border p-2 transition', reached && 'border-transparent')} style={reached ? { background: `color-mix(in oklch, ${h.goal === 'atMost' ? 'var(--destructive)' : h.color} 12%, transparent)` } : undefined}>
      <button onClick={kind === 'check' ? () => void tapHabit(h, logs) : onOpen} className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklch, ${h.color} 18%, transparent)`, color: h.color }} aria-label={h.name}>
        <AppIcon value={h.icon} size={20} />
      </button>
      <button onClick={kind === 'check' ? () => void tapHabit(h, logs) : onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-sm font-medium', kind === 'check' && ok && 'line-through opacity-70')}>{h.name}</span>
        {kind === 'check' ? (
          <span className="text-[11px] text-muted-foreground">{s > 0 ? `🔥 ${s} ngày` : 'Bắt đầu chuỗi mới'}</span>
        ) : (
          <>
            <span className="text-[11px] text-muted-foreground tabular">
              {fmtAmount(v, unit)} / {h.goal === 'atMost' ? '≤ ' : ''}
              {fmtAmount(habitTarget(h), unit)}
              {s > 0 ? ` · 🔥 ${s}` : ''}
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full transition-[width]" style={{ width: `${habitProgress(h, v) * 100}%`, background: h.goal === 'atMost' && !ok ? 'var(--destructive)' : h.color }} />
            </span>
          </>
        )}
      </button>
      {kind === 'check' ? (
        <button onClick={() => void tapHabit(h, logs)} className={cn('grid size-7 place-items-center rounded-full border-2 transition', ok && 'border-transparent text-white')} style={ok ? { background: h.color } : { borderColor: h.color }} aria-label="Hoàn thành">
          {ok && <Check className="size-4" strokeWidth={3} />}
        </button>
      ) : (
        <button
          onClick={() => void tapHabit(h, logs)}
          className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
          style={{ background: h.color }}
          title={`Cộng ${fmtAmount(habitStep(h), unit)}`}
        >
          <Plus className="size-3.5" strokeWidth={3} />
          {fmtAmount(habitStep(h), unit)}
        </button>
      )}
    </div>
  )
}

export function HabitsToday({ habits, logs }: { habits: Habit[]; logs: HabitLog[] }) {
  const today = dayKey()
  const [open, setOpen] = useState<Habit | null>(null)
  const list = habits.filter((h) => !h.archived && habitActiveOn(h, today))
  const done = list.filter((h) => h.goal !== 'atMost' && isHabitDone(h, logValue(logs, h, today))).length
  const need = list.filter((h) => h.goal !== 'atMost').length
  return (
    <Card>
      <CardHeader title={`Thói quen hôm nay ${need ? `(${done}/${need})` : ''}`} icon={<Repeat2 />} />
      <CardBody className="grid gap-1.5">
        {list.length === 0 && <p className="text-xs text-muted-foreground">Chưa có thói quen nào cho hôm nay.</p>}
        {list.map((h) => (
          <HabitRow key={h.id} h={h} logs={logs} onOpen={() => setOpen(h)} />
        ))}
      </CardBody>
      {open && <LogDialog h={habits.find((x) => x.id === open.id) ?? open} date={today} logs={logs} onClose={() => setOpen(null)} />}
    </Card>
  )
}

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const UNITS = ['ml', 'L', 'ly', 'trang', 'từ', 'bước', 'km', 'lần', 'bài', 'g', 'kcal']

type Form = Required<Pick<Habit, 'name' | 'icon' | 'color' | 'target' | 'days'>> & {
  kind: HabitKind
  unit: string
  step: number
  quick: string
  goal: 'atLeast' | 'atMost'
}

function HabitDialog({ habit, onClose, count }: { habit?: Habit; onClose: () => void; count: number }) {
  const [f, setF] = useState<Form>(() => ({
    name: habit?.name ?? '',
    icon: habit?.icon ?? '✨',
    color: habit?.color ?? COLORS[count % COLORS.length],
    kind: habit ? habitKind(habit) : 'check',
    target: habit?.target ?? 1,
    unit: habit?.unit ?? '',
    step: habit?.step ?? 1,
    quick: (habit?.quick ?? []).join(', '),
    goal: habit?.goal ?? 'atLeast',
    days: habit?.days ?? [0, 1, 2, 3, 4, 5, 6],
  }))
  const set = (p: Partial<Form>) => setF({ ...f, ...p })
  const unit = f.kind === 'duration' ? 'phút' : f.kind === 'count' ? f.unit || 'lần' : f.unit

  const save = async () => {
    if (!f.name.trim()) return toast.error('Nhập tên thói quen')
    const quick = f.quick
      .split(/[,;\s]+/)
      .map((x) => parseFloat(x.replace(',', '.')))
      .filter((x) => x > 0)
    await put('habits', {
      id: habit?.id ?? uid(),
      name: f.name.trim(),
      icon: f.icon,
      color: f.color,
      kind: f.kind,
      target: f.kind === 'check' ? 1 : Math.max(f.goal === 'atMost' ? 0 : 0.01, f.target),
      unit: f.kind === 'amount' || f.kind === 'count' ? f.unit.trim() || undefined : undefined,
      step: f.kind === 'check' ? 1 : Math.max(0.01, f.step),
      quick: f.kind === 'check' ? [] : quick,
      goal: f.kind === 'check' ? 'atLeast' : f.goal,
      days: f.days,
      createdAt: habit?.createdAt ?? Date.now(),
      order: habit?.order ?? Date.now(),
      deleted: 0,
    })
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={habit ? 'Sửa thói quen' : 'Thói quen mới'}
      className="max-w-xl"
      footer={
        <>
          {habit && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={async () => {
                await remove('habits', habit.id)
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
      <div className="grid gap-4">
        {!habit && (
          <div>
            <Label>Mẫu nhanh</Label>
            <div className="flex flex-wrap gap-1.5">
              {HABIT_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setF({ ...f, name: t.name, icon: t.icon, color: t.color ?? f.color, kind: t.kind ?? 'check', target: t.target ?? 1, unit: t.unit ?? '', step: t.step ?? 1, quick: (t.quick ?? []).join(', '), goal: t.goal ?? 'atLeast' })}
                  className="rounded-full border px-2.5 py-1 text-xs transition hover:border-primary hover:text-primary"
                >
                  {t.icon} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-end gap-3">
          <IconPicker value={f.icon} color={f.color} onChange={(icon) => set({ icon })} />
          <div className="flex-1">
            <Label>Tên</Label>
            <Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="VD: Uống nước" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => set({ color: c })} className={cn('size-7 rounded-full ring-offset-2 ring-offset-card', f.color === c && 'ring-2')} style={{ background: c, ['--tw-ring-color' as string]: c }} aria-label={c} />
          ))}
        </div>

        <div>
          <Label>Cách ghi nhận</Label>
          <Segmented
            value={f.kind}
            onChange={(kind) => set({ kind, target: kind === 'check' ? 1 : f.target > 1 ? f.target : kind === 'duration' ? 30 : kind === 'amount' ? 2000 : 3, step: kind === 'duration' ? 10 : kind === 'amount' && f.step === 1 ? 250 : f.step, unit: kind === 'amount' && !f.unit ? 'ml' : f.unit })}
            options={(Object.keys(KIND_LABEL) as HabitKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </div>

        {f.kind !== 'check' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Kiểu mục tiêu</Label>
                <Segmented
                  value={f.goal}
                  onChange={(goal) => set({ goal })}
                  options={[
                    { value: 'atLeast', label: 'Đạt ít nhất' },
                    { value: 'atMost', label: 'Không vượt quá' },
                  ]}
                />
              </div>
              {(f.kind === 'amount' || f.kind === 'count') && (
                <div>
                  <Label>Đơn vị</Label>
                  <Input list="habit-units" value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder={f.kind === 'count' ? 'lần' : 'ml, trang, km…'} />
                  <datalist id="habit-units">
                    {UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Mục tiêu / ngày ({unit || 'đơn vị'})</Label>
                <Input type="number" min={0} step="any" value={f.target} onChange={(e) => set({ target: +e.target.value })} />
              </div>
              <div>
                <Label>Mỗi lần bấm + ({unit || 'đơn vị'})</Label>
                <Input type="number" min={0} step="any" value={f.step} onChange={(e) => set({ step: +e.target.value })} />
              </div>
              <div>
                <Label>Nút nhanh thêm</Label>
                <Input value={f.quick} onChange={(e) => set({ quick: e.target.value })} placeholder="VD: 100, 500" />
              </div>
            </div>
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              Ví dụ: mỗi lần bấm <b>+{fmtAmount(f.step || 1, unit)}</b>, {f.goal === 'atMost' ? 'giữ dưới' : 'đủ'} <b>{fmtAmount(f.target || 0, unit)}</b> là {f.goal === 'atMost' ? 'đạt (vượt sẽ báo đỏ)' : 'hoàn thành'}. Bấm vào tên thói quen để nhập số tuỳ ý.
            </p>
          </>
        )}

        <div>
          <Label>Các ngày trong tuần</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}
                className={cn('h-9 flex-1 rounded-md border text-[11px] font-medium', f.days.includes(d) ? 'border-primary bg-primary-soft text-primary' : 'text-muted-foreground')}
              >
                {WD[d]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

export default function Habits() {
  const habits = useHabits().filter((h) => !h.archived)
  const logs = useHabitLogs()
  const [edit, setEdit] = useState<{ habit?: Habit } | null>(null)
  const [logFor, setLogFor] = useState<{ id: string; date: string } | null>(null)
  const today = new Date()
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  const stats = useMemo(() => {
    const tk = dayKey()
    const due = habits.filter((h) => habitActiveOn(h, tk) && h.goal !== 'atMost')
    const doneToday = due.filter((h) => isHabitDone(h, logValue(logs, h, tk))).length
    const best = Math.max(0, ...habits.map((h) => bestStreak(logs.filter((l) => l.habitId === h.id && isHabitDone(h, l.count) && l.count > 0).map((l) => l.date))))
    let need = 0
    let got = 0
    for (let i = 1; i <= 30; i++) {
      const d = addDays(new Date(), -i)
      const k = dayKey(d)
      for (const h of habits) {
        if (!habitActiveOn(h, k) || h.createdAt > d.getTime() + 86_400_000) continue
        need++
        if (isHabitDone(h, logValue(logs, h, k))) got++
      }
    }
    return { doneToday, due: due.length, best, rate: need ? got / need : 0 }
  }, [habits, logs])

  const logHabit = logFor ? habits.find((h) => h.id === logFor.id) : undefined

  return (
    <div>
      <PageHeader
        title="Thói quen"
        subtitle="Bấm + để cộng nhanh, bấm vào ngày/tên để nhập số tuỳ ý."
        actions={
          <Button onClick={() => setEdit({})}>
            <Plus /> Thói quen mới
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hôm nay" value={`${stats.doneToday}/${stats.due}`} icon={<Check />} />
        <Stat label="Tỉ lệ 30 ngày" value={`${Math.round(stats.rate * 100)}%`} icon={<Repeat2 />} color="#14b8a6" />
        <Stat label="Chuỗi dài nhất" value={`${stats.best} ngày`} icon={<Trophy />} color="#eab308" />
        <Stat label="Số thói quen" value={habits.length} icon={<Flame />} color="#f97316" />
      </div>

      {habits.length === 0 ? (
        <Card>
          <Empty
            icon={<Repeat2 />}
            title="Chưa có thói quen"
            hint="Bắt đầu với 1–3 thói quen nhỏ thôi nhé."
            action={
              <Button size="sm" className="mt-2" onClick={() => setEdit({})}>
                <Plus /> Thêm
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {habits.map((h) => {
            const hl = logs.filter((l) => l.habitId === h.id)
            const values = new Map(hl.map((l) => [l.date, l.count]))
            const s = habitStreak(h, logs)
            const best = bestStreak(hl.filter((l) => l.count > 0 && isHabitDone(h, l.count)).map((l) => l.date))
            const kind = habitKind(h)
            const unit = habitUnit(h)
            return (
              <Card key={h.id}>
                <div className="flex items-center gap-3 px-5 pt-4">
                  <span className="grid size-10 place-items-center rounded-xl" style={{ background: `color-mix(in oklch, ${h.color} 18%, transparent)`, color: h.color }}>
                    <AppIcon value={h.icon} size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      🔥 {s} ngày · kỷ lục {best} · {kind === 'check' ? 'tick' : `${h.goal === 'atMost' ? '≤' : '≥'} ${fmtAmount(habitTarget(h), unit)}, +${fmtAmount(habitStep(h), unit)}/lần`} · {h.days.length === 7 ? 'mỗi ngày' : h.days.map((d) => WD[d]).join(' ')}
                    </div>
                  </div>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ habit: h })} aria-label="Sửa">
                    <Pencil />
                  </Button>
                </div>
                <CardBody className="mt-3 grid gap-4">
                  <div className="grid grid-cols-7 gap-1.5">
                    {week.map((d) => {
                      const k = dayKey(d)
                      const v = values.get(k) ?? 0
                      const ok = isHabitDone(h, v)
                      const active = h.days.includes(getDay(d))
                      const fill = h.goal === 'atMost' ? v > 0 && ok : ok
                      return (
                        <button
                          key={k}
                          onClick={() => (kind === 'check' ? void setHabitValue(h, logs, k, v >= 1 ? 0 : 1) : setLogFor({ id: h.id, date: k }))}
                          className={cn('flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] transition hover:bg-muted', !active && 'opacity-40')}
                          title={kind === 'check' ? undefined : fmtAmount(v, unit)}
                        >
                          <span className="text-muted-foreground capitalize">{format(d, 'EEEEEE', { locale: vi })}</span>
                          {kind === 'check' ? (
                            <span className={cn('grid size-8 place-items-center rounded-full border-2 text-xs font-bold', ok && 'border-transparent text-white')} style={ok ? { background: h.color } : { borderColor: 'var(--border)' }}>
                              {ok ? <Check className="size-4" strokeWidth={3} /> : format(d, 'd')}
                            </span>
                          ) : (
                            <ProgressRing value={habitProgress(h, v)} color={h.goal === 'atMost' && !ok ? 'var(--destructive)' : h.color}>
                              {fill && h.goal !== 'atMost' ? <Check className="size-3.5" strokeWidth={3} style={{ color: h.color }} /> : format(d, 'd')}
                            </ProgressRing>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <Heatmap values={values} weeks={20} color={h.color} max={habitTarget(h) || 1} cell={11} label={(v) => (kind === 'check' ? (v ? '✓' : '—') : fmtAmount(v, unit))} />
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
      {edit && <HabitDialog key={edit.habit?.id ?? 'new'} habit={edit.habit} count={habits.length} onClose={() => setEdit(null)} />}
      {logFor && logHabit && <LogDialog h={logHabit} date={logFor.date} logs={logs} onClose={() => setLogFor(null)} />}
    </div>
  )
}
