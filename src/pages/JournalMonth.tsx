import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addMonths, format, getDay } from 'date-fns'
import { vi } from 'date-fns/locale'
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Printer, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useCourses, useHabitLogs, useHabits, useJournalRow, useJournals, useProjects, useRoles, useTasks, useTimeEntries } from '@/db/hooks'
import { GOALS_ID, monthId, saveMonth } from '@/db/actions'
import { aiConfig, aiMonthlyReview } from '@/ai/ai'
import { fmtHM, monthData } from '@/lib/bujo'
import { isHabitDone, logValue } from '@/lib/habits'
import { habitActiveOn } from '@/lib/stats'
import { cn, dayKey, fromDayKey } from '@/lib/utils'
import { MOOD } from '@/components/Ritual'
import { AppIcon } from '@/components/AppIcon'
import { ThemeDecor, ThemePicker, themeProps, useMonthTheme } from '@/components/BujoTheme'
import { Button } from '@/components/ui/button'

const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

/** score 1..10 → colour (red → amber → green) */
const scoreColor = (s?: number) => (s ? `oklch(0.72 0.17 ${20 + (s - 1) * 14})` : undefined)

function mdLite(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+/gm, '• ')
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="bujo-h mb-2 text-[1.2rem] leading-none font-bold">{children}</h3>
}

function Note({ value, onSave, placeholder }: { value?: string; onSave: (v: string) => void; placeholder: string }) {
  return (
    <textarea
      key={value ?? ''}
      defaultValue={value ?? ''}
      onBlur={(e) => e.target.value.trim() !== (value ?? '') && onSave(e.target.value.trim())}
      rows={3}
      placeholder={placeholder}
      className="w-full resize-y rounded-lg border border-dashed bg-transparent px-3 py-2 text-[0.95rem] leading-relaxed outline-none focus:border-primary"
    />
  )
}

export default function JournalMonth() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const month = /^\d{4}-\d{2}$/.test(params.get('m') ?? '') ? params.get('m')! : dayKey().slice(0, 7)
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const habits = useHabits()
  const logs = useHabitLogs()
  const journals = useJournals()
  const roles = useRoles()
  const projects = useProjects()
  const row = useJournalRow(monthId(month))
  const goalsRow = useJournalRow(GOALS_ID)
  const [busy, setBusy] = useState(false)
  const hand = (() => {
    try {
      return localStorage.getItem('mwa-bujo-hand') !== '0'
    } catch {
      return true
    }
  })()

  const m = useMemo(() => monthData(month, { tasks, entries, habits, logs, journals, roles, projects }), [month, tasks, entries, habits, logs, journals, roles, projects])
  const first = fromDayKey(`${month}-01`)
  const lead = (getDay(first) + 6) % 7
  const today = dayKey()
  const jBy = useMemo(() => new Map(journals.map((j) => [j.date, j])), [journals])
  const goals = (goalsRow?.goals ?? []).filter((g) => !g.archived)
  const shift = (n: number) => setParams({ m: format(addMonths(first, n), 'yyyy-MM') })
  const maxFocus = Math.max(60, ...m.days.map((x) => x.focus))
  const save = (patch: Parameters<typeof saveMonth>[1]) => saveMonth(month, patch)
  const { theme } = useMonthTheme(month)
  const courses = useCourses()
  const studyRows = useMemo(() => {
    const by = new Map<string, { min: number; units: number; dates: Set<string> }>()
    for (const j of journals)
      if (j.date.startsWith(month))
        for (const st of j.studies ?? []) {
          const r = by.get(st.courseId) ?? { min: 0, units: 0, dates: new Set<string>() }
          r.min += st.minutes
          r.units += st.units ?? 0
          r.dates.add(j.date)
          by.set(st.courseId, r)
        }
    return [...by.entries()]
      .map(([id, r]) => {
        const c = courses.find((x) => x.id === id)
        return { id, ...r, days: r.dates.size, name: c?.name ?? 'Khoá học đã xoá', icon: c?.icon ?? '📘', color: c?.color ?? '#94a3b8' }
      })
      .sort((a, b) => b.min - a.min)
  }, [journals, month, courses])
  const tp = themeProps(theme)

  const runAI = async () => {
    if (!aiConfig().ready) return toast.error('Cần API key AI', { description: 'Cài đặt → AI' })
    setBusy(true)
    try {
      const t = m.totals
      const lines = m.days
        .filter((d) => d.date <= today)
        .map((d) => {
          const j = jBy.get(d.date)
          return `${d.date}: điểm ${d.score ?? '-'}/10, ngủ ${fmtHM(d.sleep)}, tập trung ${fmtHM(d.focus)}, xong ${d.done} việc, thói quen ${d.habitsDone}/${d.habitsDue}${j?.win ? `, làm tốt: ${j.win}` : ''}${j?.note ? `, ghi chú: ${j.note.slice(0, 80)}` : ''}`
        })
      const summary = `Tháng ${month}. Tổng: ${t.done} việc xong, tập trung ${fmtHM(t.focus)}, điểm TB ${t.avgScore.toFixed(1)}/10, ngủ TB ${fmtHM(t.avgSleep)}, tỉ lệ thói quen ${Math.round(t.habitRate * 100)}%, ${t.journaled} ngày có ghi nhật ký.
Mục tiêu dài hạn: ${goals.map((g) => `${g.name} (${m.days.filter((d) => jBy.get(d.date)?.goalsDone?.includes(g.id)).length} ngày)`).join('; ') || 'chưa đặt'}
Thời gian theo project: ${m.projects.map((p) => `${p.name} ${fmtHM(p.min)}`).join('; ') || 'không có'}
Từng ngày:
${lines.join('\n')}`
      const r = await aiMonthlyReview(summary)
      await save({ review: r })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4', hand && 'font-hand')}>
      <div className="no-print flex flex-wrap items-center gap-2 font-sans">
        <h1 className="mr-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="size-6 text-primary" /> Tổng kết tháng
        </h1>
        <Button size="icon-sm" variant="outline" onClick={() => shift(-1)} aria-label="Tháng trước">
          <ChevronLeft />
        </Button>
        <span className="min-w-28 text-center text-sm font-semibold capitalize">{format(first, 'MMMM yyyy', { locale: vi })}</span>
        <Button size="icon-sm" variant="outline" onClick={() => shift(1)} aria-label="Tháng sau">
          <ChevronRight />
        </Button>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => nav('/journal')}>
            ← Trang ngày
          </Button>
          <ThemePicker month={month} />
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer /> In / PDF
          </Button>
        </div>
      </div>

      <article style={tp.style} className={cn(tp.className, 'relative min-w-0 rounded-2xl border p-4 shadow-sm sm:p-6', theme.corner.length && 'pb-20')}>
        <ThemeDecor theme={theme} seed={month} big />
        <div className="relative z-10 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="bujo-accent text-sm font-semibold">
              monthly review · {theme.emoji} {theme.name}
            </div>
            <h2 className="bujo-title text-3xl font-bold capitalize sm:text-4xl">{format(first, 'MMMM, yyyy', { locale: vi })}</h2>
          </div>
          <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-center sm:grid-cols-6">
            {[
              [`${m.totals.journaled}`, 'ngày ghi'],
              [m.totals.avgScore ? m.totals.avgScore.toFixed(1) : '—', 'điểm TB'],
              [`${m.totals.done}`, 'việc xong'],
              [fmtHM(m.totals.focus), 'tập trung'],
              [m.totals.avgSleep ? fmtHM(m.totals.avgSleep) : '—', 'ngủ TB'],
              [`${Math.round(m.totals.habitRate * 100)}%`, 'thói quen'],
            ].map(([a, b]) => (
              <div key={b}>
                <div className="text-xl font-bold tabular">{a}</div>
                <div className="text-[11px] text-muted-foreground">{b}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* pixels calendar */}
          <section>
            <H>Mỗi ngày một ô</H>
            <div className="grid grid-cols-7 gap-1.5">
              {WD.map((w) => (
                <div key={w} className="text-center text-[11px] text-muted-foreground">
                  {w}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`x${i}`} />
              ))}
              {m.days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => nav(`/journal?d=${d.date}`)}
                  title={`${d.date}${d.score ? ` · ${d.score}/10` : ''} · ${d.done} việc · ${fmtHM(d.focus)} tập trung`}
                  className={cn('relative flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition hover:ring-2 hover:ring-primary/50', d.date === today && 'ring-2 ring-[var(--bj-accent)]', d.date > today && 'opacity-40')}
                  style={d.score ? { background: scoreColor(d.score), color: 'white', borderColor: 'transparent' } : undefined}
                >
                  <span className="font-semibold tabular">{Number(d.date.slice(8))}</span>
                  {d.mood ? <span className="text-[13px] leading-none">{MOOD[d.mood - 1]}</span> : d.score ? <span className="text-[10px] opacity-90">{d.score}</span> : null}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              Điểm ngày: 1
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className="h-2.5 w-3 rounded-sm" style={{ background: scoreColor(i + 1) }} />
              ))}
              10
            </div>
          </section>

          {/* habit tracker */}
          <section className="min-w-0">
            <H>Habit tracker</H>
            {m.habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có thói quen.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-[3px] text-[11px]">
                  <thead>
                    <tr>
                      <th />
                      {m.days.map((d) => (
                        <th key={d.date} className={cn('w-4 font-normal text-muted-foreground tabular', d.date === today && 'bujo-accent')}>
                          {Number(d.date.slice(8))}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {m.habits.map((h) => {
                      let n = 0
                      let due = 0
                      return (
                        <tr key={h.id}>
                          <td className="pr-2 whitespace-nowrap">
                            <AppIcon value={h.icon} size={13} className="mr-1 align-[-2px]" style={{ color: h.color }} />
                            <span className="text-[13px]">{h.name.length > 16 ? h.name.slice(0, 15) + '…' : h.name}</span>
                          </td>
                          {m.days.map((d) => {
                            const active = habitActiveOn(h, d.date) && d.date <= today
                            const ok = active && isHabitDone(h, logValue(logs, h, d.date)) && (logValue(logs, h, d.date) > 0 || h.goal === 'atMost')
                            if (active) due++
                            if (ok) n++
                            return (
                              <td key={d.date} className="p-0">
                                <span className={cn('block size-3.5 rounded-full border', !active && 'border-dashed opacity-30')} style={ok ? { background: h.color, borderColor: h.color } : undefined} />
                              </td>
                            )
                          })}
                          <td className="pl-1 text-muted-foreground tabular">
                            {n}/{due}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section>
            <H>Mục tiêu dài hạn</H>
            {goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Đặt ở trang ngày → "Mục tiêu dài hạn".</p>
            ) : (
              <ul className="grid gap-2">
                {goals.map((g) => {
                  const on = m.days.filter((d) => jBy.get(d.date)?.goalsDone?.includes(g.id))
                  return (
                    <li key={g.id}>
                      <div className="flex justify-between text-[0.95rem]">
                        <span>{g.name}</span>
                        <b className="tabular">{on.length} ngày</b>
                      </div>
                      <div className="mt-0.5 flex gap-[2px]">
                        {m.days.map((d) => (
                          <span key={d.date} className={cn('h-2 flex-1 rounded-[1px]', on.includes(d) ? 'bujo-fill' : 'bg-muted')} />
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <H>Thời gian đi đâu</H>
            {m.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa đếm giờ tháng này.</p>
            ) : (
              <ul className="grid gap-1.5">
                {m.projects.map((p) => (
                  <li key={p.id}>
                    <div className="flex justify-between gap-2 text-[0.95rem]">
                      <span className="truncate">{p.name}</span>
                      <b className="tabular">{fmtHM(p.min)}</b>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(p.min / m.projects[0].min) * 100}%`, background: p.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <H>Nhịp tập trung</H>
            <div className="flex h-24 items-end gap-[2px]">
              {m.days.map((d) => (
                <div key={d.date} title={`${d.date}: ${fmtHM(d.focus)}`} className="flex-1 rounded-t-[2px] opacity-80 bujo-fill" style={{ height: `${(d.focus / maxFocus) * 100}%`, minHeight: d.focus ? 2 : 0 }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular">
              <span>1</span>
              <span>{m.days.length}</span>
            </div>
            {m.best && (
              <p className="mt-2 text-sm">
                🌟 Ngày tốt nhất: <b>{format(fromDayKey(m.best.date), 'EEEE dd/MM', { locale: vi })}</b> ({m.best.score}/10)
              </p>
            )}
          </section>
        </div>

        {studyRows.length > 0 && (
          <section>
            <H>Học tập tháng này</H>
            <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {studyRows.map((r) => (
                <li key={r.id}>
                  <div className="flex justify-between gap-2 text-[0.95rem]">
                    <span className="truncate">
                      {r.icon} {r.name}
                    </span>
                    <b className="shrink-0 tabular">
                      {fmtHM(r.min)} · {r.days} ngày{r.units ? ` · +${r.units}` : ''}
                    </b>
                  </div>
                  <div className="mt-0.5 flex gap-[2px]">
                    {m.days.map((d) => (
                      <span key={d.date} className="h-1.5 flex-1 rounded-[1px]" style={{ background: r.dates.has(d.date) ? r.color : 'var(--muted)' }} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {m.wins.length > 0 && (
          <section>
            <H>Những điều làm tốt</H>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {m.wins.map((j) => (
                <li key={j.id} className="flex gap-2 text-[0.95rem]">
                  <span className="w-11 shrink-0 text-xs text-muted-foreground tabular">{j.date.slice(8)}/{j.date.slice(5, 7)}</span>
                  <span>✨ {j.win}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <div>
            <H>👍 Tháng này làm tốt</H>
            <Note value={row?.good} onSave={(good) => void save({ good: good || undefined, reviewedAt: Date.now() })} placeholder="Điều mình tự hào…" />
          </div>
          <div>
            <H>🔧 Cần cải thiện</H>
            <Note value={row?.improve} onSave={(improve) => void save({ improve: improve || undefined, reviewedAt: Date.now() })} placeholder="Điều làm chưa tốt, vì sao…" />
          </div>
          <div>
            <H>🎯 Tháng sau tập trung</H>
            <Note value={row?.nextFocus} onSave={(nextFocus) => void save({ nextFocus: nextFocus || undefined, reviewedAt: Date.now() })} placeholder="3 mục tiêu cho tháng tới…" />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <H>Nhận xét của AI coach</H>
            <Button size="sm" variant="soft" className="no-print font-sans" onClick={runAI} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {row?.review ? 'Viết lại' : 'AI tổng kết'}
            </Button>
          </div>
          {row?.review ? (
            <div className="rounded-xl bg-[color-mix(in_oklch,var(--bj-tint)_70%,transparent)] p-4 text-[0.95rem] leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: mdLite(row.review) }} />
          ) : (
            <p className="text-sm text-muted-foreground">AI đọc nhật ký cả tháng (điểm ngày, giấc ngủ, thói quen, điều làm tốt) và gợi ý 3 mục tiêu cho tháng sau.</p>
          )}
        </section>
        </div>
      </article>
    </div>
  )
}
