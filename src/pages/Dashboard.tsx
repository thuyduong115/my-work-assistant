import { useMemo, useState } from 'react'
import { addDays, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Zap, AlertTriangle, BrainCircuit, CalendarCheck, CheckCircle2, Clock, Flame, Loader2, Repeat, Sparkles, Trophy, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useTasks, useTimeEntries } from '@/db/hooks'
import { aiConfig, aiWeeklyReview } from '@/ai/ai'
import { actualMinutes, calibrationFactor } from '@/lib/scheduler'
import { activityByDay, bestStreak, focusByDay, isOverdue, procrastinationScore, scoreLabel, streak } from '@/lib/stats'
import { dayKey, fmtMin } from '@/lib/utils'
import { isHabitDone } from '@/lib/habits'
import { useSettings } from '@/stores/settings'
import { useUI } from '@/stores/ui'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Empty, PageHeader, Stat } from '@/components/ui/misc'
import { TaskItem } from '@/components/TaskItem'
import { Heatmap } from '@/components/Heatmap'
import { C_A, C_B, ChartTooltip, axisProps, gridProps } from '@/components/charts'

function Gauge({ score }: { score: number }) {
  const { label, color } = scoreLabel(score)
  const r = 70
  const c = Math.PI * r
  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="104" viewBox="0 0 180 104" role="img" aria-label={`Điểm trì hoãn ${score}/100`}>
        <path d="M 20 95 A 70 70 0 0 1 160 95" fill="none" stroke="var(--muted)" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 95 A 70 70 0 0 1 160 95" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset .8s' }} />
        <text x="90" y="82" textAnchor="middle" className="fill-foreground" style={{ fontSize: 34, fontWeight: 800 }}>
          {score}
        </text>
        <text x="90" y="100" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 10 }}>
          / 100
        </text>
      </svg>
      <p className="mt-1 text-center text-sm font-medium">{label}</p>
    </div>
  )
}

function WeeklyReview() {
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const habits = useHabits()
  const logs = useHabitLogs()
  const [text, setText] = useState(() => localStorage.getItem('mwa-review') ?? '')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (!aiConfig().ready) return toast.error('Cần API key AI', { description: 'Cài đặt → AI' })
    setBusy(true)
    try {
      const since = addDays(new Date(), -7).getTime()
      const done = tasks.filter((t) => t.doneAt && t.doneAt > since)
      const focus = entries.filter((e) => e.start > since).reduce((s, e) => s + (e.end - e.start) / 60000, 0)
      const open = tasks.filter((t) => t.status !== 'done')
      const ps = procrastinationScore(tasks)
      const habitRate = habits.map((h) => `${h.name}: ${logs.filter((l) => l.habitId === h.id && l.date >= dayKey(addDays(new Date(), -7)) && l.count > 0 && isHabitDone(h, l.count)).length}/7`).join(', ')
      const summary = `Tuần qua:
- Hoàn thành ${done.length} task: ${done.slice(0, 25).map((t) => t.title).join('; ')}
- Thời gian tập trung: ${fmtMin(focus)}
- Task quá hạn hiện tại: ${open.filter((t) => isOverdue(t)).map((t) => t.title).join('; ') || 'không'}
- Task bị dời nhiều: ${open.filter((t) => t.postponeCount >= 2).map((t) => `${t.title} (${t.postponeCount} lần)`).join('; ') || 'không'}
- Điểm trì hoãn: ${ps.score}/100, tỉ lệ đúng hạn ${Math.round(ps.onTimeRate * 100)}%
- Thói quen: ${habitRate}
- Việc tuần tới (deadline 7 ngày): ${open.filter((t) => t.deadline && t.deadline <= dayKey(addDays(new Date(), 7))).map((t) => `${t.title} (${t.deadline})`).join('; ') || 'không'}`
      const r = await aiWeeklyReview(summary)
      setText(r)
      localStorage.setItem('mwa-review', r)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader
        title="Nhìn lại tuần (AI coach)"
        icon={<BrainCircuit />}
        action={
          <Button size="sm" variant="soft" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {text ? 'Viết lại' : 'Tạo nhận xét'}
          </Button>
        }
      />
      <CardBody>
        {text ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: mdLite(text) }} />
        ) : (
          <p className="text-xs text-muted-foreground">Mỗi Chủ nhật, để AI nhận xét tuần: điểm tốt, dấu hiệu trì hoãn và 3 đề xuất cho tuần tới.</p>
        )}
      </CardBody>
    </Card>
  )
}

function mdLite(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+/gm, '• ')
}

export default function Dashboard() {
  const all = useTasks()
  const entries = useTimeEntries()
  const logs = useHabitLogs()
  const goal = useSettings((s) => s.dailyGoalMin)
  const openTask = useUI((s) => s.openTask)
  const tasks = useMemo(() => all ?? [], [all])
  const today = dayKey()

  const d = useMemo(() => {
    const actual = actualMinutes(entries)
    const focus = focusByDay(entries)
    const act = activityByDay(tasks, entries, logs)
    const weekAgo = addDays(new Date(), -7).getTime()
    const open = tasks.filter((t) => t.status !== 'done')
    const done30 = Array.from({ length: 30 }, (_, i) => {
      const dt = addDays(new Date(), i - 29)
      const k = dayKey(dt)
      return { k, label: format(dt, 'dd/MM'), done: tasks.filter((t) => t.doneAt && dayKey(new Date(t.doneAt)) === k).length }
    })
    const focus14 = Array.from({ length: 14 }, (_, i) => {
      const dt = addDays(new Date(), i - 13)
      return { label: format(dt, 'EEE dd', { locale: vi }), focus: Math.round(focus.get(dayKey(dt)) ?? 0) }
    })
    const byHour = Array.from({ length: 24 }, (_, h) => ({ h: `${h}h`, min: 0 }))
    for (const e of entries) {
      let t = e.start
      while (t < e.end) {
        const h = new Date(t).getHours()
        const next = Math.min(e.end, new Date(t).setMinutes(60, 0, 0))
        byHour[h].min += (next - t) / 60000
        t = next
      }
    }
    const est = tasks
      .filter((t) => t.status === 'done' && (actual.get(t.id) ?? 0) > 1)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
      .slice(0, 8)
      .reverse()
      .map((t) => ({ name: t.title.length > 14 ? t.title.slice(0, 13) + '…' : t.title, full: t.title, est: t.estimateMin, actual: Math.round(actual.get(t.id) ?? 0) }))
    const heat = new Map([...act.entries()].map(([k, v]) => [k, v.score]))
    return {
      ps: procrastinationScore(tasks),
      overdue: open.filter((t) => isOverdue(t, today)).sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1)),
      dueToday: open.filter((t) => t.deadline === today).length,
      doneWeek: tasks.filter((t) => t.doneAt && t.doneAt > weekAgo).length,
      focusWeek: entries.filter((e) => e.start > weekAgo).reduce((s, e) => s + (e.end - e.start) / 60000, 0),
      postponed: open.filter((t) => t.postponeCount >= 2).sort((a, b) => b.postponeCount - a.postponeCount).slice(0, 6),
      streak: streak((k) => !!act.get(k)?.productive),
      best: bestStreak([...act.entries()].filter(([, v]) => v.productive).map(([k]) => k)),
      done30,
      focus14,
      byHour: byHour.slice(5, 24).map((x) => ({ ...x, min: Math.round(x.min) })),
      est,
      factor: calibrationFactor(tasks, actual),
      heat,
      actual,
    }
  }, [tasks, entries, logs, today])

  if (!all) return null
  const peak = d.byHour.reduce((a, b) => (b.min > a.min ? b : a), d.byHour[0])

  return (
    <div className="grid gap-5">
      <PageHeader title="Dashboard" subtitle="Nhìn thẳng vào sự thật — để không trì hoãn nữa." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Quá hạn" value={d.overdue.length} icon={<AlertTriangle />} color={d.overdue.length ? '#ef4444' : '#22c55e'} sub={d.overdue.length ? 'cần xử lý' : 'sạch sẽ ✨'} />
        <Stat label="Đến hạn hôm nay" value={d.dueToday} icon={<CalendarCheck />} color="#f97316" />
        <Stat label="Xong 7 ngày" value={d.doneWeek} icon={<CheckCircle2 />} color="#22c55e" />
        <Stat label="Tập trung 7 ngày" value={fmtMin(d.focusWeek)} icon={<Clock />} color={C_B} sub={`TB ${fmtMin(d.focusWeek / 7)}/ngày`} />
        <Stat label="Chuỗi ngày" value={`${d.streak} 🔥`} icon={<Trophy />} color="#eab308" sub={`kỷ lục ${d.best} ngày`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Chỉ số trì hoãn" icon={<Flame />} description="Càng thấp càng tốt" />
          <CardBody>
            <Gauge score={d.ps.score} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted/60 p-2">
                <div className="text-base font-bold">{d.ps.overdue}</div>
                <div className="text-muted-foreground">quá hạn</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <div className="text-base font-bold">{d.ps.postpones}</div>
                <div className="text-muted-foreground">lần dời</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-2">
                <div className="text-base font-bold">{Math.round(d.ps.onTimeRate * 100)}%</div>
                <div className="text-muted-foreground">đúng hạn</div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Bị dời nhiều lần" icon={<Repeat />} description="Dấu hiệu trì hoãn: hãy chia nhỏ bằng AI và làm bước 2 phút đầu tiên." />
          <div className="px-2 pb-2">
            {d.postponed.length === 0 ? (
              <Empty icon={<TrendingUp />} title="Không có task nào bị dời ≥ 2 lần" hint="Bạn đang giữ nhịp rất tốt!" />
            ) : (
              d.postponed.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <TaskItem task={t} actualMin={d.actual.get(t.id)} />
                  </div>
                  <Button size="sm" onClick={() => useUI.getState().openTwoMin(t.id)} className="bg-amber-500 hover:bg-amber-500/90">
                    <Zap /> 2 phút
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => openTask(t.id)}>
                    <Sparkles /> Chia nhỏ
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {d.overdue.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader title={`Danh sách quá hạn (${d.overdue.length})`} icon={<AlertTriangle className="!text-destructive" />} />
          <div className="grid px-2 pb-2 md:grid-cols-2">
            {d.overdue.map((t) => (
              <TaskItem key={t.id} task={t} actualMin={d.actual.get(t.id)} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Task hoàn thành — 30 ngày" icon={<CheckCircle2 />} />
          <CardBody className="h-56">
            <ResponsiveContainer>
              <BarChart data={d.done30} margin={{ left: -24, right: 4, top: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={4} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip />} />
                <Bar dataKey="done" name="Hoàn thành" fill={C_A} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Giờ tập trung — 14 ngày" icon={<Clock />} description={`Đường kẻ: mục tiêu ${fmtMin(goal)}/ngày`} />
          <CardBody className="h-56">
            <ResponsiveContainer>
              <AreaChart data={d.focus14} margin={{ left: -16, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="gFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={C_B} stopOpacity={0.35} />
                    <stop offset="1" stopColor={C_B} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval={2} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip fmt={fmtMin} />} />
                <ReferenceLine y={goal} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="focus" name="Tập trung" stroke={C_B} strokeWidth={2} fill="url(#gFocus)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ước lượng vs thực tế" icon={<TrendingUp />} description={`Bạn thường làm ${d.factor === 1 ? 'đúng như' : d.factor > 1 ? `lâu hơn ${Math.round((d.factor - 1) * 100)}% so với` : `nhanh hơn ${Math.round((1 - d.factor) * 100)}% so với`} ước lượng — lịch tự động đã tính sẵn.`} />
          <CardBody className="h-60">
            {d.est.length ? (
              <ResponsiveContainer>
                <BarChart data={d.est} margin={{ left: -16, right: 4, top: 8 }} barGap={2}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="name" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 9 }} />
                  <YAxis {...axisProps} />
                  <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip fmt={fmtMin} />} />
                  <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="est" name="Ước lượng" fill={C_A} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="actual" name="Thực tế" fill={C_B} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty icon={<Clock />} title="Chưa đủ dữ liệu" hint="Bấm ▶ trên task để đếm giờ, hoàn thành task để so sánh." />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Khung giờ tập trung tốt nhất" icon={<BrainCircuit />} description={peak.min > 0 ? `Bạn tập trung nhiều nhất lúc ${peak.h} — xếp việc khó vào giờ này.` : 'Chưa có dữ liệu đếm giờ.'} />
          <CardBody className="h-60">
            <ResponsiveContainer>
              <BarChart data={d.byHour} margin={{ left: -16, right: 4, top: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="h" {...axisProps} interval={2} />
                <YAxis {...axisProps} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltip fmt={fmtMin} />} />
                <Bar dataKey="min" name="Tổng phút" fill={C_B} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Bản đồ năng suất (1 năm)" icon={<Flame />} description="Mỗi ô là 1 ngày: task xong + thời gian tập trung + thói quen." />
        <CardBody>
          <Heatmap values={d.heat} weeks={52} label={(v) => `điểm ${Math.round(v * 10) / 10}`} />
        </CardBody>
      </Card>

      <WeeklyReview />
    </div>
  )
}
