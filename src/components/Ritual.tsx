import { useEffect, useMemo, useState } from 'react'
import { addDays, getDay } from 'date-fns'
import confetti from 'canvas-confetti'
import { Check, ChevronLeft, ChevronRight, Loader2, Moon, NotebookPen, Sparkles, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useJournal, useJournals, useTasks, useTimeEntries } from '@/db/hooks'
import { postpone, saveJournal, toggleDone, updateTask } from '@/db/actions'
import type { Task } from '@/db/types'
import { aiConfig, aiDailyPlan } from '@/ai/ai'
import { todayView } from '@/lib/selectors'
import { topTasks } from '@/lib/scheduler'
import { focusByDay, habitActiveOn } from '@/lib/stats'
import { isHabitDone } from '@/lib/habits'
import { cn, dayKey, fmtDay, fmtMin } from '@/lib/utils'
import { parseSlots, useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label, Textarea } from './ui/input'
import { CheckCircle } from './ui/misc'
import { Card, CardHeader } from './ui/card'

export const ENERGY = ['🪫', '😴', '🙂', '💪', '⚡']
export const MOOD = ['😞', '😕', '😐', '🙂', '😄']

function Steps({ n, cur }: { n: number; cur: number }) {
  return (
    <div className="mb-4 flex gap-1.5">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cn('h-1.5 flex-1 rounded-full transition', i <= cur ? 'bg-primary' : 'bg-muted')} />
      ))}
    </div>
  )
}

function Row({ task, children }: { task: Task; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
      <span className={cn('min-w-0 flex-1 truncate text-sm', task.status === 'done' && 'text-muted-foreground line-through')}>{task.title}</span>
      {children}
    </div>
  )
}

function Scale({ value, onChange, icons, labels }: { value?: number; onChange: (v: number) => void; icons: string[]; labels: string[] }) {
  return (
    <div className="flex gap-1.5">
      {icons.map((ic, i) => (
        <button
          key={i}
          type="button"
          title={labels[i]}
          onClick={() => onChange(i + 1)}
          className={cn('grid h-12 flex-1 place-items-center rounded-xl border text-2xl transition hover:scale-105', value === i + 1 ? 'border-primary bg-primary-soft ring-2 ring-primary/40' : 'opacity-70 hover:opacity-100')}
        >
          {ic}
        </button>
      ))}
    </div>
  )
}

/** Today's free time from the work-hour settings */
function capacityToday() {
  return parseSlots(useSettings.getState().workHours[getDay(new Date())] ?? '').reduce((s, [a, b]) => s + b - a, 0)
}

function Morning({ step, setStep, done }: { step: number; setStep: (n: number) => void; done: () => void }) {
  const today = dayKey()
  const all = useTasks() ?? []
  const journal = useJournal(today)
  const v = useMemo(() => todayView(all, today), [all, today])
  const [picked, setPicked] = useState<string[]>([])
  const [energy, setEnergy] = useState<number>()
  const [intention, setIntention] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded || journal === undefined) return
    setPicked(journal.top3 ?? [])
    setEnergy(journal.energy)
    setIntention(journal.intention ?? '')
    setLoaded(true)
  }, [journal, loaded])

  const leftovers = [...v.overdue, ...v.missed]
  const candidates = useMemo(() => {
    const todayIds = new Set(v.items.map((i) => i.task.id))
    return topTasks(all)
      .filter((t) => t.status !== 'done')
      .sort((a, b) => {
        const ta = todayIds.has(a.id) ? 0 : 1
        const tb = todayIds.has(b.id) ? 0 : 1
        if (ta !== tb) return ta - tb
        return (a.deadline ?? '9') < (b.deadline ?? '9') ? -1 : (a.deadline ?? '9') > (b.deadline ?? '9') ? 1 : 0
      })
      .slice(0, 20)
  }, [all, v.items])
  const cap = capacityToday()
  const plannedMin = v.items.reduce((s, i) => s + (i.task.plan?.find((b) => b.date === today)?.min ?? i.task.estimateMin), 0)

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]))
  const aiPick = async () => {
    if (!aiConfig().ready) return toast.error('Cần API key AI', { description: 'Cài đặt → AI' })
    setBusy(true)
    try {
      const summary = candidates.map((t) => `- ${t.title} | ưu tiên ${t.priority} | ${t.estimateMin}p | deadline ${t.deadline ?? 'không'} | dời ${t.postponeCount} lần`).join('\n')
      const r = await aiDailyPlan(`Danh sách task:\n${summary}`)
      const ids = r.top3.map((x) => candidates.find((c) => c.title === x.title)?.id).filter(Boolean) as string[]
      if (ids.length) setPicked(ids.slice(0, 3))
      if (r.message) toast(r.message)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const finish = async () => {
    await saveJournal(today, { top3: picked, energy, intention: intention.trim() || undefined, morningAt: Date.now() })
    for (const id of picked) {
      const t = all.find((x) => x.id === id)
      if (t && !t.plan?.some((b) => b.date === today) && t.scheduledDate !== today) await updateTask(id, { scheduledDate: today, pinned: false })
    }
    toast.success('Chúc bạn một ngày hiệu quả! ☀️', { description: picked.length ? 'Ưu tiên 3 việc chính trước nhé.' : undefined })
    done()
  }

  return (
    <>
      <Steps n={3} cur={step} />
      {step === 0 && (
        <div className="grid gap-3">
          <h3 className="font-semibold">1. Dọn việc tồn</h3>
          {leftovers.length === 0 ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm">Không có việc quá hạn hay bị lỡ. Tuyệt! 🎉</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Quyết định nhanh cho từng việc: làm hôm nay, dời, hay đã xong.</p>
              <div className="grid max-h-[45vh] gap-1.5 overflow-y-auto">
                {leftovers.map((t) => (
                  <Row key={t.id} task={t}>
                    {t.status !== 'done' && (
                      <>
                        <Button size="sm" variant={t.scheduledDate === today ? 'default' : 'soft'} onClick={() => updateTask(t.id, { scheduledDate: today, pinned: false })}>
                          Hôm nay
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => postpone(t)}>
                          Dời
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Đã xong" onClick={() => toggleDone(t)}>
                          <Check />
                        </Button>
                      </>
                    )}
                  </Row>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">2. Chọn 3 việc chính ({picked.length}/3)</h3>
            <Button size="sm" variant="soft" onClick={aiPick} disabled={busy || !candidates.length}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} AI chọn giúp
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Hôm nay bạn có khoảng <b>{fmtMin(cap)}</b> rảnh, lịch đã xếp <b className={plannedMin > cap ? 'text-destructive' : ''}>{fmtMin(plannedMin)}</b>. Làm xong 3 việc này là một ngày thành công.
          </p>
          <div className="grid max-h-[45vh] gap-1.5 overflow-y-auto">
            {candidates.map((t) => {
              const i = picked.indexOf(t.id)
              return (
                <button key={t.id} onClick={() => toggle(t.id)} className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition', i >= 0 ? 'border-primary bg-primary-soft/60' : 'hover:bg-muted', i < 0 && picked.length >= 3 && 'opacity-50')}>
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold', i >= 0 && 'border-transparent bg-primary text-primary-foreground')}>{i >= 0 ? i + 1 : ''}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtMin(t.estimateMin)}
                    {t.deadline && ` · hạn ${t.deadline.slice(8)}/${t.deadline.slice(5, 7)}`}
                  </span>
                </button>
              )
            })}
            {!candidates.length && <p className="py-6 text-center text-sm text-muted-foreground">Chưa có task nào — thêm việc bằng Nhập nhanh nhé.</p>}
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4">
          <h3 className="font-semibold">3. Năng lượng & ý định</h3>
          <div>
            <Label>Năng lượng sáng nay</Label>
            <Scale value={energy} onChange={setEnergy} icons={ENERGY} labels={['Cạn kiệt', 'Mệt', 'Bình thường', 'Khoẻ', 'Tràn đầy']} />
            {energy !== undefined && energy <= 2 && <p className="mt-1.5 text-xs text-muted-foreground">Ngày mệt: chọn việc nhẹ trước, dùng "Bắt đầu 2 phút" cho việc khó.</p>}
          </div>
          <div>
            <Label>Hôm nay mình muốn… (tuỳ chọn)</Label>
            <Input value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="VD: xong slide trước 10h, không lướt mạng khi làm" onKeyDown={(e) => e.key === 'Enter' && void finish()} />
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <ChevronLeft /> Quay lại
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)}>
            Tiếp <ChevronRight />
          </Button>
        ) : (
          <Button onClick={finish}>
            <Sun /> Bắt đầu ngày
          </Button>
        )}
      </div>
    </>
  )
}

function Evening({ step, setStep, done }: { step: number; setStep: (n: number) => void; done: () => void }) {
  const today = dayKey()
  const tomorrow = dayKey(addDays(new Date(), 1))
  const all = useTasks() ?? []
  const entries = useTimeEntries()
  const habits = useHabits()
  const logs = useHabitLogs()
  const journal = useJournal(today)
  const v = useMemo(() => todayView(all, today), [all, today])
  const [mood, setMood] = useState<number>()
  const [win, setWin] = useState('')
  const [note, setNote] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded || journal === undefined) return
    setMood(journal.mood)
    setWin(journal.win ?? '')
    setNote(journal.note ?? '')
    setLoaded(true)
  }, [journal, loaded])

  const top3 = (journal?.top3 ?? []).map((id) => all.find((t) => t.id === id)).filter(Boolean) as Task[]
  const focus = focusByDay(entries).get(today) ?? 0
  const activeHabits = habits.filter((h) => !h.archived && habitActiveOn(h, today))
  const habitsDone = activeHabits.filter((h) => isHabitDone(h, logs.find((l) => l.habitId === h.id && l.date === today)?.count ?? 0)).length
  const remaining = v.items.map((i) => i.task).filter((t) => t.status !== 'done')

  const finish = async () => {
    await saveJournal(today, { mood, win: win.trim() || undefined, note: note.trim() || undefined, eveningAt: Date.now() })
    void confetti({ particleCount: 80, spread: 80, origin: { y: 0.7 }, colors: ['#8b5cf6', '#ec4899', '#14b8a6', '#eab308'], disableForReducedMotion: true })
    toast.success('Đã tổng kết ngày 🌙', { description: 'Nghỉ ngơi thật tốt nhé!' })
    done()
  }

  return (
    <>
      <Steps n={3} cur={step} />
      {step === 0 && (
        <div className="grid gap-3">
          <h3 className="font-semibold">1. Hôm nay bạn đã…</h3>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              [v.doneToday.length, 'việc xong'],
              [fmtMin(focus), 'tập trung'],
              [`${habitsDone}/${activeHabits.length}`, 'thói quen'],
              [journal?.distractions ?? 0, 'lần xao nhãng'],
            ].map(([a, b]) => (
              <div key={b as string} className="rounded-xl bg-muted/60 p-2.5">
                <div className="text-lg font-bold">{a}</div>
                <div className="text-xs text-muted-foreground">{b}</div>
              </div>
            ))}
          </div>
          {top3.length > 0 && (
            <>
              <Label>3 việc chính sáng nay</Label>
              <div className="grid gap-1.5">
                {top3.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2">
                    <CheckCircle checked={t.status === 'done'} onChange={() => toggleDone(t)} />
                    <span className={cn('text-sm', t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">2. Việc còn lại ({remaining.length})</h3>
            {remaining.length > 1 && (
              <Button size="sm" variant="soft" onClick={() => remaining.forEach((t) => void postpone(t))}>
                Dời tất cả sang mai
              </Button>
            )}
          </div>
          {remaining.length === 0 ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm">Đã xong hết việc hôm nay! 🏆</p>
          ) : (
            <div className="grid max-h-[45vh] gap-1.5 overflow-y-auto">
              {remaining.map((t) => (
                <Row key={t.id} task={t}>
                  <Button size="sm" variant={t.scheduledDate === tomorrow ? 'default' : 'soft'} onClick={() => postpone(t)}>
                    Mai làm
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Đã xong" onClick={() => toggleDone(t)}>
                    <Check />
                  </Button>
                </Row>
              ))}
            </div>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4">
          <h3 className="font-semibold">3. Nhìn lại</h3>
          <div>
            <Label>Hôm nay thế nào?</Label>
            <Scale value={mood} onChange={setMood} icons={MOOD} labels={['Tệ', 'Không ổn', 'Bình thường', 'Tốt', 'Tuyệt']} />
          </div>
          <div>
            <Label>Một điều làm tốt / tự hào</Label>
            <Input value={win} onChange={(e) => setWin(e.target.value)} placeholder="VD: không lướt điện thoại khi học" />
          </div>
          <div>
            <Label>Ghi chú (bài học, ngày mai cần lưu ý…)</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <ChevronLeft /> Quay lại
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)}>
            Tiếp <ChevronRight />
          </Button>
        ) : (
          <Button onClick={finish}>
            <Moon /> Xong ngày
          </Button>
        )}
      </div>
    </>
  )
}

export function RitualDialog() {
  const { ritual, ritualStep, openRitual } = useUI()
  const [step, setStep] = useState(0)
  useEffect(() => {
    setStep(ritualStep ?? 0)
  }, [ritual, ritualStep])
  const close = () => openRitual(undefined)
  return (
    <Dialog
      open={!!ritual}
      onOpenChange={(o) => !o && close()}
      title={
        ritual === 'evening' ? (
          <span className="flex items-center gap-2">
            <Moon className="size-4 text-indigo-400" /> Tổng kết ngày
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sun className="size-4 text-amber-400" /> Bắt đầu ngày mới
          </span>
        )
      }
      description="Khoảng 1 phút"
      className="max-w-xl"
    >
      {ritual === 'morning' && <Morning step={step} setStep={setStep} done={close} />}
      {ritual === 'evening' && <Evening step={step} setStep={setStep} done={close} />}
    </Dialog>
  )
}

/** Banner on the Today page inviting the morning plan / evening review */
export function RitualBanner() {
  const today = dayKey()
  const j = useJournal(today)
  const { morning, evening, rituals } = useSettings((s) => s.reminders)
  const openRitual = useUI((s) => s.openRitual)
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const [eh, em] = evening.split(':').map(Number)
  const [mh, mm] = morning.split(':').map(Number)
  if (!rituals) return null
  const isEvening = nowMin >= eh * 60 + em - 60
  const isMorning = nowMin >= mh * 60 + mm - 120
  if (isEvening && !j?.eveningAt)
    return (
      <button onClick={() => openRitual('evening')} className="flex items-center gap-3 rounded-xl border border-indigo-400/40 bg-gradient-to-r from-indigo-500/15 to-violet-500/10 p-3 text-left transition hover:border-indigo-400">
        <Moon className="size-5 shrink-0 text-indigo-400" />
        <span className="flex-1 text-sm">
          <b>Tổng kết ngày</b> <span className="text-muted-foreground">— tick việc đã xong, dời việc còn lại, ghi lại hôm nay thế nào (1 phút)</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
    )
  if (!isEvening && isMorning && !j?.morningAt)
    return (
      <button onClick={() => openRitual('morning')} className="flex items-center gap-3 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-400/15 to-orange-400/10 p-3 text-left transition hover:border-amber-400">
        <Sun className="size-5 shrink-0 text-amber-500" />
        <span className="flex-1 text-sm">
          <b>Bắt đầu ngày mới</b> <span className="text-muted-foreground">— dọn việc tồn, chọn 3 việc chính, ghi năng lượng (1 phút)</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
    )
  return null
}

/** Last two weeks of morning/evening entries (Dashboard) */
export function JournalCard() {
  const journals = useJournals().filter((j) => j.morningAt || j.eveningAt).slice(0, 14)
  const openRitual = useUI((s) => s.openRitual)
  return (
    <Card>
      <CardHeader
        title="Nhật ký ngày"
        icon={<NotebookPen />}
        description="Từ nghi thức sáng / tối — năng lượng, tâm trạng, điều làm tốt."
        action={
          <Button size="sm" variant="soft" onClick={() => openRitual(new Date().getHours() >= 17 ? 'evening' : 'morning')}>
            Ghi hôm nay
          </Button>
        }
      />
      <div className="px-2 pb-2">
        {journals.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Chưa có — làm nghi thức sáng/tối ở trang Hôm nay nhé.</p>
        ) : (
          journals.map((j) => (
            <div key={j.id} className="flex items-start gap-3 rounded-lg px-3 py-2 odd:bg-muted/40">
              <span className="w-20 shrink-0 text-xs font-medium capitalize text-muted-foreground">{fmtDay(j.date, 'EEE dd/MM')}</span>
              <span className="w-14 shrink-0 text-lg leading-none" title="Năng lượng · tâm trạng">
                {j.energy ? ENERGY[j.energy - 1] : '·'} {j.mood ? MOOD[j.mood - 1] : '·'}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                {j.win && <span className="block">✨ {j.win}</span>}
                {j.note && <span className="block text-xs text-muted-foreground">{j.note}</span>}
                {!j.win && !j.note && j.intention && <span className="block text-xs text-muted-foreground">🎯 {j.intention}</span>}
              </span>
              {!!j.distractions && <span className="shrink-0 text-[11px] text-muted-foreground">👀 {j.distractions}</span>}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
