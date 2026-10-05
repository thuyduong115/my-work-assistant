import { useMemo, useState } from 'react'
import { addDays, format, getDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Check, Flame, Pencil, Plus, Repeat2, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import confetti from 'canvas-confetti'
import { put, remove } from '@/db/db'
import { useHabitLogs, useHabits } from '@/db/hooks'
import type { Habit, HabitLog } from '@/db/types'
import { bestStreak, habitActiveOn, habitStreak } from '@/lib/stats'
import { COLORS, cn, dayKey, uid } from '@/lib/utils'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Empty, PageHeader, Stat } from '@/components/ui/misc'
import { Heatmap } from '@/components/Heatmap'

const logId = (habitId: string, date: string) => `${habitId}_${date}`

export async function bumpHabit(h: Habit, logs: HabitLog[], date = dayKey(), delta?: number) {
  const cur = logs.find((l) => l.habitId === h.id && l.date === date)?.count ?? 0
  // tap cycles 0 → target → 0 for target 1; increments otherwise
  let next = delta !== undefined ? cur + delta : cur >= h.target ? 0 : cur + 1
  next = Math.max(0, next)
  await put('habitLogs', { id: logId(h.id, date), habitId: h.id, date, count: next, deleted: 0 })
  if (next >= h.target && cur < h.target) {
    void confetti({ particleCount: 40, spread: 60, scalar: 0.7, origin: { y: 0.6 }, colors: [h.color, '#facc15'], disableForReducedMotion: true })
    const s = habitStreak(h, [...logs.filter((l) => !(l.habitId === h.id && l.date === date)), { habitId: h.id, date, count: next } as HabitLog])
    toast.success(`${h.icon} ${h.name}`, { description: s > 1 ? `Chuỗi ${s} ngày 🔥` : 'Tốt lắm!' })
  }
}

export function HabitsToday({ habits, logs }: { habits: Habit[]; logs: HabitLog[] }) {
  const today = dayKey()
  const list = habits.filter((h) => !h.archived && habitActiveOn(h, today))
  const done = list.filter((h) => (logs.find((l) => l.habitId === h.id && l.date === today)?.count ?? 0) >= h.target).length
  return (
    <Card>
      <CardHeader title={`Thói quen hôm nay ${list.length ? `(${done}/${list.length})` : ''}`} icon={<Repeat2 />} />
      <CardBody className="grid gap-1.5">
        {list.length === 0 && <p className="text-xs text-muted-foreground">Chưa có thói quen nào cho hôm nay.</p>}
        {list.map((h) => {
          const c = logs.find((l) => l.habitId === h.id && l.date === today)?.count ?? 0
          const ok = c >= h.target
          const s = habitStreak(h, logs)
          return (
            <button
              key={h.id}
              onClick={() => void bumpHabit(h, logs)}
              className={cn('flex items-center gap-3 rounded-xl border p-2 text-left transition hover:scale-[1.01]', ok && 'border-transparent')}
              style={ok ? { background: `color-mix(in oklch, ${h.color} 14%, transparent)` } : undefined}
            >
              <span className="grid size-8 place-items-center rounded-lg text-lg" style={{ background: `color-mix(in oklch, ${h.color} 18%, transparent)` }}>
                {h.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-medium', ok && 'line-through opacity-70')}>{h.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {h.target > 1 ? `${c}/${h.target} · ` : ''}
                  {s > 0 ? `🔥 ${s} ngày` : 'Bắt đầu chuỗi mới'}
                </span>
              </span>
              <span className={cn('grid size-6 place-items-center rounded-full border-2 transition', ok && 'border-transparent text-white')} style={ok ? { background: h.color } : { borderColor: h.color }}>
                {ok && <Check className="size-3.5" strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </CardBody>
    </Card>
  )
}

const EMOJIS = ['💧', '📚', '🏃', '🧘', '🛌', '🥗', '✍️', '🇬🇧', '💻', '🎸', '🙏', '🚭', '☀️', '🧹', '💊', '📵']
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function HabitDialog({ habit, open, onClose, count }: { habit?: Habit; open: boolean; onClose: () => void; count: number }) {
  const [f, setF] = useState(() => ({ name: habit?.name ?? '', icon: habit?.icon ?? '✨', color: habit?.color ?? COLORS[count % COLORS.length], target: habit?.target ?? 1, days: habit?.days ?? [0, 1, 2, 3, 4, 5, 6] }))
  const save = async () => {
    if (!f.name.trim()) return
    await put('habits', { id: habit?.id ?? uid(), ...f, name: f.name.trim(), createdAt: habit?.createdAt ?? Date.now(), order: habit?.order ?? Date.now(), deleted: 0 })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={habit ? 'Sửa thói quen' : 'Thói quen mới'}
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
        <div>
          <Label>Tên</Label>
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: Học 10 từ tiếng Anh" />
        </div>
        <div>
          <Label>Biểu tượng</Label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setF({ ...f, icon: e })} className={cn('grid size-9 place-items-center rounded-lg border text-lg', f.icon === e && 'border-primary bg-primary-soft')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Màu</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setF({ ...f, color: c })} className={cn('size-7 rounded-full ring-offset-2 ring-offset-card', f.color === c && 'ring-2')} style={{ background: c, ['--tw-ring-color' as string]: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Số lần / ngày</Label>
            <Input type="number" min={1} max={20} value={f.target} onChange={(e) => setF({ ...f, target: Math.max(1, +e.target.value || 1) })} />
          </div>
          <div>
            <Label>Các ngày</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  onClick={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}
                  className={cn('h-9 flex-1 rounded-md border text-[11px] font-medium', f.days.includes(d) ? 'border-primary bg-primary-soft text-primary' : 'text-muted-foreground')}
                >
                  {WD[d]}
                </button>
              ))}
            </div>
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
  const today = new Date()
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))

  const stats = useMemo(() => {
    const tk = dayKey()
    const due = habits.filter((h) => habitActiveOn(h, tk))
    const doneToday = due.filter((h) => (logs.find((l) => l.habitId === h.id && l.date === tk)?.count ?? 0) >= h.target).length
    const best = Math.max(0, ...habits.map((h) => bestStreak(logs.filter((l) => l.habitId === h.id && l.count >= h.target).map((l) => l.date))))
    // completion rate last 30 days
    let need = 0
    let got = 0
    for (let i = 0; i < 30; i++) {
      const k = dayKey(addDays(today, -i))
      for (const h of habits) {
        if (!habitActiveOn(h, k) || h.createdAt > addDays(today, -i).getTime() + 86400000) continue
        need++
        if ((logs.find((l) => l.habitId === h.id && l.date === k)?.count ?? 0) >= h.target) got++
      }
    }
    return { doneToday, due: due.length, best, rate: need ? got / need : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, logs])

  return (
    <div>
      <PageHeader
        title="Thói quen"
        subtitle="Xây thói quen nhỏ mỗi ngày — bấm vào ô để đánh dấu."
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
          <Empty icon={<Repeat2 />} title="Chưa có thói quen" hint="Bắt đầu với 1–3 thói quen nhỏ thôi nhé." action={<Button size="sm" className="mt-2" onClick={() => setEdit({})}><Plus /> Thêm</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {habits.map((h) => {
            const hl = logs.filter((l) => l.habitId === h.id)
            const values = new Map(hl.map((l) => [l.date, l.count]))
            const s = habitStreak(h, logs)
            const best = bestStreak(hl.filter((l) => l.count >= h.target).map((l) => l.date))
            return (
              <Card key={h.id}>
                <div className="flex items-center gap-3 px-5 pt-4">
                  <span className="grid size-10 place-items-center rounded-xl text-xl" style={{ background: `color-mix(in oklch, ${h.color} 18%, transparent)` }}>
                    {h.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{h.name}</div>
                    <div className="text-xs text-muted-foreground">
                      🔥 {s} ngày · kỷ lục {best} · {h.target}×/ngày · {h.days.length === 7 ? 'mỗi ngày' : h.days.map((d) => WD[d]).join(' ')}
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
                      const c = values.get(k) ?? 0
                      const ok = c >= h.target
                      const active = h.days.includes(getDay(d))
                      return (
                        <button
                          key={k}
                          onClick={() => void bumpHabit(h, logs, k)}
                          className={cn('flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] transition hover:bg-muted', !active && 'opacity-40')}
                        >
                          <span className="text-muted-foreground capitalize">{format(d, 'EEEEEE', { locale: vi })}</span>
                          <span
                            className={cn('grid size-8 place-items-center rounded-full border-2 text-xs font-bold', ok && 'border-transparent text-white')}
                            style={ok ? { background: h.color } : { borderColor: c > 0 ? h.color : 'var(--border)' }}
                          >
                            {ok ? <Check className="size-4" strokeWidth={3} /> : c > 0 ? c : format(d, 'd')}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <Heatmap values={values} weeks={20} color={h.color} max={h.target} cell={11} label={(v) => `${v}/${h.target}`} />
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
      {edit && <HabitDialog key={edit.habit?.id ?? 'new'} open habit={edit.habit} count={habits.length} onClose={() => setEdit(null)} />}
    </div>
  )
}
