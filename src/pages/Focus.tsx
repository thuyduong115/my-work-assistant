import { useMemo, useState } from 'react'
import { CloudRain, Coffee, PictureInPicture2, Timer as TimerIcon, Volume2, VolumeX, Waves, Hourglass, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { useJournal, useTasks, useTimeEntries } from '@/db/hooks'
import { topTasks } from '@/lib/scheduler'
import { playNoise, setNoiseVolume, stopNoise, type NoiseKind } from '@/lib/noise'
import { dayKey, fmtClock, fmtMin } from '@/lib/utils'
import { useSettings } from '@/stores/settings'
import { useTimer } from '@/stores/timer'
import { openMini } from '@/stores/pip'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Segmented, Stat } from '@/components/ui/misc'
import { PHASE_LABEL, Ring, TimerControls, useTimerView } from '@/components/Timer'

export default function Focus() {
  const v = useTimerView()
  const setTask = useTimer((s) => s.setTask)
  const tasks = useTasks() ?? []
  const entries = useTimeEntries()
  const pomo = useSettings((s) => s.pomodoro)
  const [noise, setNoise] = useState<NoiseKind | null>(null)
  const [vol, setVol] = useState(0.25)
  const today = dayKey()
  const open = useMemo(() => {
    const l = topTasks(tasks).filter((t) => t.status !== 'done')
    const isToday = (t: (typeof l)[0]) => t.plan?.some((b) => b.date === today) || t.scheduledDate === today || (t.deadline && t.deadline <= today)
    return [...l.filter(isToday), ...l.filter((t) => !isToday(t))]
  }, [tasks, today])
  const todays = entries.filter((e) => dayKey(new Date(e.start)) === today).sort((a, b) => b.start - a.start)
  const focusToday = todays.reduce((s, e) => s + (e.end - e.start) / 60000, 0)
  const color = v.phase === 'focus' ? 'var(--primary)' : 'var(--success)'

  const toggleNoise = (k: NoiseKind) => {
    if (noise === k) {
      stopNoise()
      setNoise(null)
    } else {
      playNoise(k, vol)
      setNoise(k)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="flex flex-col items-center gap-5 px-4 py-8">
        <Segmented
          value={v.mode}
          onChange={(m) => {
            if (v.active) return toast('Dừng đồng hồ hiện tại trước khi đổi chế độ')
            useTimer.setState({ mode: m })
          }}
          options={[
            { value: 'pomodoro', label: <><TimerIcon /> Pomodoro</> },
            { value: 'stopwatch', label: <><Hourglass /> Bấm giờ</> },
          ]}
        />
        <Ring progress={v.total ? v.progress : (v.elapsed % 3600) / 3600} size={280} stroke={14} color={color}>
          <div className="text-center">
            <div className="text-xs font-semibold tracking-wider uppercase" style={{ color }}>
              {v.phase === 'focus' ? <TimerIcon className="mr-1 inline size-3.5" /> : <Coffee className="mr-1 inline size-3.5" />}
              {PHASE_LABEL[v.phase]}
            </div>
            <div className="tabular font-mono text-6xl font-bold tracking-tight">{fmtClock(v.active ? v.display : v.total)}</div>
            <div className="mt-1 text-xs text-muted-foreground">🍅 × {v.cycles} hôm nay</div>
          </div>
        </Ring>
        <div className="w-full max-w-md">
          <Select value={v.taskId ?? ''} onChange={(e) => setTask(e.target.value || undefined)} className="h-10 text-center font-medium">
            <option value="">— Chọn task để tập trung —</option>
            {open.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </div>
        <TimerControls />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void openMini()}>
            <PictureInPicture2 /> Cửa sổ mini luôn nổi
          </Button>
          {'Notification' in window && Notification.permission !== 'granted' && (
            <Button variant="outline" size="sm" onClick={() => void Notification.requestPermission()}>
              <Bell /> Bật thông báo
            </Button>
          )}
        </div>
        <p className="max-w-md text-center text-xs text-muted-foreground">
          Pomodoro: {pomo.focus}p tập trung · {pomo.short}p nghỉ · nghỉ dài {pomo.long}p sau {pomo.longEvery} lần. Đổi trong Cài đặt. Thời gian được ghi vào task để thống kê.
        </p>
      </Card>

      <div className="grid content-start gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Hôm nay" value={fmtMin(focusToday)} />
          <Stat label="Phiên" value={todays.length} />
          <Distractions />
        </div>
        <Card>
          <CardHeader title="Âm thanh nền" icon={<Volume2 />} />
          <CardBody className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['rain', 'Mưa', CloudRain],
                ['brown', 'Sóng nâu', Waves],
                ['white', 'Trắng', Volume2],
              ] as const).map(([k, l, I]) => (
                <Button key={k} variant={noise === k ? 'default' : 'outline'} size="sm" onClick={() => toggleNoise(k)}>
                  <I /> {l}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <VolumeX className="size-4 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.02}
                value={vol}
                onChange={(e) => {
                  setVol(+e.target.value)
                  setNoiseVolume(+e.target.value)
                }}
                className="flex-1 accent-[var(--primary)]"
              />
              <Volume2 className="size-4 text-muted-foreground" />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Phiên hôm nay" icon={<TimerIcon />} />
          <CardBody className="grid gap-1.5">
            {todays.length === 0 && <p className="text-xs text-muted-foreground">Chưa có phiên nào. Bắt đầu thôi! 💪</p>}
            {todays.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {new Date(e.start).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="flex-1 truncate">{tasks.find((t) => t.id === e.taskId)?.title ?? 'Không gắn task'}</span>
                <span className="text-xs font-semibold">{fmtMin((e.end - e.start) / 60000)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Distractions() {
  const n = useJournal(dayKey())?.distractions ?? 0
  const on = useSettings((s) => s.focusGuard.enabled)
  if (!on) return null
  return <Stat label="Xao nhãng" value={`${n} 👀`} sub={n ? 'lần rời tab khi tập trung' : 'chưa lần nào 💪'} />
}
