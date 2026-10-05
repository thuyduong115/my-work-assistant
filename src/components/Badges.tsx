import { useEffect, useMemo } from 'react'
import confetti from 'canvas-confetti'
import { Medal } from 'lucide-react'
import { toast } from 'sonner'
import { useHabitLogs, useHabits, useJournals, useTasks, useTimeEntries } from '@/db/hooks'
import { computeBadges, earned } from '@/lib/badges'
import { cn } from '@/lib/utils'
import { Card, CardBody, CardHeader } from './ui/card'
import { Progress } from './ui/misc'

function useBadges() {
  const tasks = useTasks()
  const entries = useTimeEntries()
  const habits = useHabits()
  const logs = useHabitLogs()
  const journals = useJournals()
  return useMemo(() => (tasks ? computeBadges(tasks, entries, habits, logs, journals) : null), [tasks, entries, habits, logs, journals])
}

const SEEN_KEY = 'mwa-badges'

/** Celebrates newly earned badges (renders nothing) */
export function BadgeWatcher() {
  const badges = useBadges()
  useEffect(() => {
    if (!badges) return
    const now = badges.filter(earned).map((b) => b.id)
    let seen: string[] | null = null
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as string[] | null
    } catch {
      /* ignore */
    }
    const fresh = seen ? badges.filter((b) => earned(b) && !seen!.includes(b.id)) : []
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(now))
    } catch {
      /* ignore */
    }
    for (const b of fresh) {
      toast.success(`${b.icon} Huy hiệu mới: ${b.name}`, { description: b.desc, duration: 8000 })
      void confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true })
    }
  }, [badges])
  return null
}

export function BadgesCard() {
  const badges = useBadges()
  if (!badges) return null
  const got = badges.filter(earned).length
  return (
    <Card>
      <CardHeader title={`Huy hiệu (${got}/${badges.length})`} icon={<Medal />} description="Tự mở khoá từ dữ liệu của bạn — xám là chưa đạt." />
      <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {badges.map((b) => {
          const ok = earned(b)
          return (
            <div key={b.id} title={b.desc} className={cn('flex flex-col items-center gap-1 rounded-xl border p-3 text-center', ok ? 'border-amber-400/50 bg-amber-400/10' : 'opacity-60')}>
              <span className={cn('text-3xl', !ok && 'grayscale')}>{b.icon}</span>
              <span className="text-xs font-semibold">{b.name}</span>
              <span className="text-[10px] leading-tight text-muted-foreground">{b.desc}</span>
              {!ok && (
                <>
                  <Progress value={b.value / b.goal} className="mt-1 h-1" />
                  <span className="text-[10px] text-muted-foreground">
                    {Math.min(b.value, b.goal)}/{b.goal}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
