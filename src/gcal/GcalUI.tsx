import { useState } from 'react'
import { CalendarDays, Check, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn, dayKey } from '@/lib/utils'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { connect, disconnect, eventsOn, syncGcal, useGCal } from './gcal'

const fmtT = (ms: number) => new Date(ms).toTimeString().slice(0, 5)

export function GcalToday() {
  const { connected, events, status } = useGCal()
  if (!connected) return null
  const list = eventsOn(events, dayKey()).sort((a, b) => a.start - b.start)
  return (
    <Card>
      <CardHeader
        title="Lịch Google hôm nay"
        icon={<CalendarDays />}
        action={
          status === 'need-auth' ? (
            <Button size="sm" variant="soft" onClick={() => void syncGcal(true)}>
              Kết nối lại
            </Button>
          ) : undefined
        }
      />
      <CardBody className="grid gap-1.5">
        {list.length === 0 && <p className="text-xs text-muted-foreground">Không có sự kiện nào hôm nay.</p>}
        {list.map((e) => (
          <a key={e.id} href={e.link} target="_blank" rel="noreferrer" className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted', e.end < Date.now() && 'opacity-50')}>
            <span className="h-5 w-1 rounded-full" style={{ background: e.color }} />
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular">{e.allDay ? 'Cả ngày' : `${fmtT(e.start)}–${fmtT(e.end)}`}</span>
            <span className="truncate">{e.title}</span>
          </a>
        ))}
      </CardBody>
    </Card>
  )
}

export function GcalSettings() {
  const g = useGCal()
  const [busy, setBusy] = useState(false)
  const [cid, setCid] = useState(g.clientId)
  const origin = location.origin

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <details className="rounded-lg border p-3 text-sm" open={!g.clientId}>
        <summary className="cursor-pointer font-medium">Hướng dẫn lấy OAuth Client ID (miễn phí, ~5 phút, làm 1 lần)</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>
            Mở{' '}
            <a className="text-primary hover:underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
              Google Calendar API
            </a>{' '}
            → chọn project (có thể dùng project Gemini <i>my-work-assistant</i>) → <b>Enable</b>.
          </li>
          <li>
            <a className="text-primary hover:underline" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">
              Google Auth Platform
            </a>{' '}
            → <b>Get started</b>: đặt tên app, email của bạn → Audience: <b>External</b> → tạo.
          </li>
          <li>
            Mục <b>Audience</b> → <b>Test users</b> → <b>Add users</b> → thêm Gmail bạn dùng Google Calendar.
          </li>
          <li>
            Mục <b>Clients</b> → <b>Create client</b> → Application type: <b>Web application</b> → Authorized JavaScript origins: <code className="rounded bg-muted px-1">{origin}</code> → Create.
          </li>
          <li>Copy <b>Client ID</b> (dạng …apps.googleusercontent.com) dán vào ô bên dưới → Lưu → Kết nối.</li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Khi đăng nhập Google có thể hiện "Google chưa xác minh ứng dụng này" — bấm <b>Tiếp tục</b> (đây là app của chính bạn). Client ID là thông tin công khai, không phải mật khẩu.
        </p>
      </details>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label>OAuth Client ID</Label>
          <Input value={cid} onChange={(e) => setCid(e.target.value.trim())} placeholder="123456-abc.apps.googleusercontent.com" />
        </div>
        <Button variant="outline" onClick={() => (g.set({ clientId: cid }), toast.success('Đã lưu Client ID'))}>
          Lưu
        </Button>
      </div>

      {!g.connected ? (
        <div>
          <Button disabled={!g.clientId || busy} onClick={() => run(connect, 'Đã kết nối Google Calendar 🎉')}>
            {busy ? <Loader2 className="animate-spin" /> : <CalendarDays />} Kết nối Google Calendar
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="size-4 text-success" /> {g.email ?? 'Đã kết nối'}
              </div>
              <div className={cn('text-xs', g.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {g.status === 'syncing'
                  ? 'Đang đồng bộ…'
                  : g.status === 'need-auth'
                    ? 'Phiên đăng nhập Google đã hết hạn — bấm Đồng bộ để đăng nhập lại.'
                    : g.status === 'error'
                      ? `Lỗi: ${g.error}`
                      : g.lastSync
                        ? `Đồng bộ lúc ${new Date(g.lastSync).toLocaleTimeString('vi-VN')} · ${g.events.length} sự kiện`
                        : 'Sẵn sàng'}
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={busy || g.status === 'syncing'} onClick={() => run(() => syncGcal(true), 'Đã đồng bộ Google Calendar')}>
              <RefreshCw className={g.status === 'syncing' ? 'animate-spin' : ''} /> Đồng bộ
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}>
              <LogOut /> Ngắt kết nối
            </Button>
          </div>

          <div>
            <Label>Lấy sự kiện từ các lịch (để hiển thị & tránh xếp task trùng giờ)</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.calendars.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={g.selected.includes(c.id)}
                    onChange={(e) => g.set({ selected: e.target.checked ? [...g.selected, c.id] : g.selected.filter((x) => x !== c.id) })}
                  />
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">{c.summary}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={g.exportEnabled} onChange={(e) => g.set({ exportEnabled: e.target.checked })} />
              Đẩy lịch làm task lên Google (30 ngày tới, nhắc trước 5 phút) vào lịch:
            </label>
            <Select value={g.exportCalendarId} onChange={(e) => g.set({ exportCalendarId: e.target.value })} disabled={!g.exportEnabled}>
              <option value="primary">Lịch chính</option>
              {g.calendars
                .filter((c) => c.canWrite && !c.primary)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                  </option>
                ))}
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mẹo: tạo một lịch riêng tên "Work Assistant" trong Google Calendar rồi chọn ở đây để dễ bật/tắt hiển thị. Sự kiện do app tạo có dấu ✅ và tự cập nhật/xoá khi lịch task thay đổi.{' '}
            <a className="inline-flex items-center gap-0.5 text-primary hover:underline" href="https://calendar.google.com" target="_blank" rel="noreferrer">
              Mở Google Calendar <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
