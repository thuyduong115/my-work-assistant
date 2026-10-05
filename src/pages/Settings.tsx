import { useEffect, useState, type ReactNode } from 'react'
import { Bot, Check, Cloud, Copy, Database, Download, ExternalLink, Keyboard, Loader2, LogOut, Monitor, Moon, Palette, RefreshCw, Smartphone, Sun, Timer, Upload, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/db/db'
import { TABLES } from '@/db/types'
import { PROVIDERS, listModels, aiBreakdown, pickGeminiModel } from '@/ai/ai'
import { DEFAULT_MODELS, useSettings, type AIProvider, type Accent } from '@/stores/settings'
import { initSync, resendConfirmation, signIn, signOut, signUp, syncNow, useSync } from '@/sync/sync'
import { SUPABASE_SQL } from '@/sync/schema'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/input'
import { PageHeader, Segmented } from '@/components/ui/misc'

function Section({ id, icon, title, desc, children }: { id?: string; icon: ReactNode; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20 p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-4.5">{icon}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

function AISection() {
  const { ai, set } = useSettings()
  const p = ai.provider
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const key = p === 'none' ? '' : ai.keys[p] ?? ''
  const model = p === 'none' ? '' : ai.model[p] || DEFAULT_MODELS[p]
  const setAI = (patch: Partial<typeof ai>) => set({ ai: { ...ai, ...patch } })

  const load = async () => {
    if (p === 'none' || !key) return
    setBusy(true)
    try {
      const ms = await listModels(p, key)
      setModels(ms)
      if (!ms.includes(model)) {
        const pick = p === 'gemini' ? pickGeminiModel(ms) : ms[0]
        if (pick) setAI({ model: { ...ai.model, [p]: pick } })
      }
      toast.success(`Tải được ${ms.length} model`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const test = async () => {
    setBusy(true)
    try {
      const r = await aiBreakdown('Mua sữa mai và học tiếng Anh 30 phút', { projects: [], roles: ['Cá nhân'], factor: 1 })
      const m = useSettings.getState().ai.model[p as Exclude<AIProvider, 'none'>] || DEFAULT_MODELS[p]
      toast.success(`AI hoạt động! ✅ (${m})`, { description: r.tasks.map((t) => t.title).join(' · ') })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="ai" icon={<Bot />} title="AI tách task" desc="Dùng API miễn phí. Key chỉ lưu trên trình duyệt của bạn (không đồng bộ, không gửi đi đâu khác ngoài nhà cung cấp AI).">
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-4">
          {(['gemini', 'groq', 'openrouter', 'none'] as AIProvider[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setAI({ provider: k })
                setModels([])
              }}
              className={cn('rounded-xl border p-3 text-left text-sm transition', p === k ? 'border-primary bg-primary-soft' : 'hover:bg-muted')}
            >
              <div className="font-medium">{k === 'none' ? 'Tắt AI' : PROVIDERS[k].name}</div>
              <div className="text-[11px] text-muted-foreground">{k === 'gemini' ? 'Khuyên dùng' : k === 'none' ? 'Chỉ bộ tách offline' : 'Thay thế'}</div>
            </button>
          ))}
        </div>
        {p !== 'none' && (
          <>
            <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
              {PROVIDERS[p].hint}{' '}
              <a href={PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                Lấy key tại đây <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>API key</Label>
                <Input type="password" value={key} onChange={(e) => setAI({ keys: { ...ai.keys, [p]: e.target.value.trim() } })} placeholder="Dán API key…" autoComplete="off" />
              </div>
              <div>
                <Label>Model</Label>
                <div className="flex gap-2">
                  {models.length ? (
                    <Select value={model} onChange={(e) => setAI({ model: { ...ai.model, [p]: e.target.value } })}>
                      {models.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input value={model} onChange={(e) => setAI({ model: { ...ai.model, [p]: e.target.value } })} />
                  )}
                  <Button variant="outline" size="icon" onClick={load} disabled={!key || busy} title="Tải danh sách model">
                    {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Button variant="soft" onClick={test} disabled={!key || busy}>
                <Check /> Kiểm tra kết nối
              </Button>
            </div>
          </>
        )}
      </div>
    </Section>
  )
}

function SyncSection() {
  const { supabase, set } = useSettings()
  const { status, error, lastSync, session } = useSync()
  const [url, setUrl] = useState(supabase.url)
  const [anon, setAnon] = useState(supabase.anonKey)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const configured = !!supabase.url && !!supabase.anonKey

  const saveCfg = async () => {
    set({ supabase: { url: url.trim(), anonKey: anon.trim() } })
    setTimeout(() => void initSync(), 0)
    toast.success('Đã lưu cấu hình Supabase')
  }
  const auth = async (mode: 'in' | 'up') => {
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email, pw)
      else {
        const hasSession = await signUp(email, pw)
        toast.success(hasSession ? 'Đã tạo tài khoản' : 'Kiểm tra email để xác nhận tài khoản, rồi đăng nhập.')
      }
    } catch (e) {
      if ((e as Error).message === 'EMAIL_NOT_CONFIRMED') setUnconfirmed(true)
      else toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="sync" icon={<Cloud />} title="Đồng bộ Supabase" desc="Dùng trên nhiều thiết bị (laptop, điện thoại). Dữ liệu vẫn lưu offline trên máy, tự đồng bộ khi có mạng.">
      <div className="grid gap-4">
        <details className="rounded-lg border p-3 text-sm" open={!configured}>
          <summary className="cursor-pointer font-medium">Hướng dẫn cài đặt (5 phút, miễn phí)</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
            <li>
              Vào{' '}
              <a className="text-primary hover:underline" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
                supabase.com
              </a>{' '}
              → New project (gói Free).
            </li>
            <li>
              Mở <b>SQL Editor</b> → dán đoạn SQL bên dưới → <b>Run</b>.
            </li>
            <li>
              <b>Project Settings → API</b>: copy <b>Project URL</b> và <b>anon public key</b> dán vào đây.
            </li>
            <li>
              (Tuỳ chọn) <b>Authentication → URL Configuration</b>: đặt Site URL = <code>{location.origin + location.pathname}</code>. Hoặc tắt "Confirm email" ở Authentication → Providers → Email để đăng ký nhanh.
            </li>
            <li>Đăng ký / đăng nhập bằng email + mật khẩu.</li>
          </ol>
          <div className="relative mt-3">
            <Textarea readOnly value={SUPABASE_SQL} rows={6} className="font-mono text-[11px]" />
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2"
              onClick={() => {
                void navigator.clipboard.writeText(SUPABASE_SQL)
                toast.success('Đã copy SQL')
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </details>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label>Project URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          </div>
          <div>
            <Label>Anon public key</Label>
            <Input type="password" value={anon} onChange={(e) => setAnon(e.target.value)} placeholder="eyJhbGciOi…" />
          </div>
          <Button variant="outline" onClick={saveCfg}>
            Lưu
          </Button>
        </div>

        {configured && !session && (
          <form
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void auth('in')
            }}
          >
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <Label>Mật khẩu (≥ 6 ký tự)</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required minLength={6} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Đăng nhập
            </Button>
            <Button type="button" variant="outline" disabled={busy || !email || pw.length < 6} onClick={() => void auth('up')}>
              Đăng ký
            </Button>
          </form>
        )}

        {unconfirmed && !session && (
          <div className="grid gap-2 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
            <b>Email chưa được xác nhận</b>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Mở hộp thư <b>{email}</b> (xem cả mục Spam/Quảng cáo), tìm email từ Supabase và bấm <b>Confirm your mail</b>, rồi quay lại bấm Đăng nhập.
              Nếu link mở ra trang lỗi/localhost: vào Supabase → <b>Authentication → URL Configuration</b>, đặt Site URL = <code>{location.origin + location.pathname}</code> rồi gửi lại.
              Muốn bỏ bước này: Supabase → <b>Authentication → Sign In / Providers → Email</b> → tắt <b>Confirm email</b>.
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  try {
                    await resendConfirmation(email)
                    toast.success('Đã gửi lại email xác nhận')
                  } catch (e) {
                    toast.error((e as Error).message)
                  }
                }}
              >
                Gửi lại email xác nhận
              </Button>
            </div>
          </div>
        )}

        {session && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{session.user.email}</div>
              <div className={cn('text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {status === 'syncing' ? 'Đang đồng bộ…' : status === 'error' ? `Lỗi: ${error}` : lastSync ? `Đồng bộ lúc ${new Date(lastSync).toLocaleTimeString('vi-VN')}` : 'Sẵn sàng'}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={status === 'syncing'}>
              <RefreshCw className={status === 'syncing' ? 'animate-spin' : ''} /> Đồng bộ ngay
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut /> Đăng xuất
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}

function DataSection() {
  const exportData = async () => {
    const out: Record<string, unknown[]> = {}
    for (const t of TABLES) out[t] = await db[t].toArray()
    const blob = new Blob([JSON.stringify({ app: 'my-work-assistant', version: 1, exportedAt: new Date().toISOString(), data: out }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `work-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importData = async (file: File) => {
    try {
      const j = JSON.parse(await file.text())
      if (j.app !== 'my-work-assistant') throw new Error('File không đúng định dạng')
      let n = 0
      for (const t of TABLES) {
        const rows = (j.data?.[t] ?? []) as { id: string }[]
        // mark dirty so imported data syncs up
        const table = db[t] as unknown as { bulkPut: (rows: unknown[]) => Promise<unknown> }
        await table.bulkPut(rows.map((r) => ({ ...r, dirty: 1, updatedAt: Date.now() })))
        n += rows.length
      }
      toast.success(`Đã nhập ${n} bản ghi`)
      void syncNow()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Section icon={<Database />} title="Dữ liệu" desc="Sao lưu toàn bộ dữ liệu ra file JSON, hoặc khôi phục từ file.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportData}>
          <Download /> Xuất JSON
        </Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted [&_svg]:size-4">
          <Upload /> Nhập JSON
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        </label>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={async () => {
            if (!confirm('Xoá TOÀN BỘ dữ liệu trên máy này? (Dữ liệu trên Supabase vẫn còn)')) return
            await db.delete()
            localStorage.removeItem('mwa-seeded')
            Object.keys(localStorage).filter((k) => k.startsWith('mwa-sync-cursor')).forEach((k) => localStorage.removeItem(k))
            location.reload()
          }}
        >
          <Trash2 /> Xoá dữ liệu trên máy
        </Button>
      </div>
    </Section>
  )
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>
}
let deferred: BIPEvent | null = null
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BIPEvent
  })

export default function Settings() {
  const s = useSettings()
  const [canInstall, setCanInstall] = useState(!!deferred)
  useEffect(() => {
    const fn = () => setCanInstall(true)
    window.addEventListener('beforeinstallprompt', fn)
    if (location.hash.includes('#sync') || location.href.includes('settings#sync')) document.getElementById('sync')?.scrollIntoView()
    return () => window.removeEventListener('beforeinstallprompt', fn)
  }, [])

  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <PageHeader title="Cài đặt" />

      <Section icon={<Palette />} title="Giao diện">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented
            value={s.theme}
            onChange={(theme) => s.set({ theme })}
            options={[
              { value: 'light', label: <><Sun /> Sáng</> },
              { value: 'dark', label: <><Moon /> Tối</> },
              { value: 'system', label: <><Monitor /> Hệ thống</> },
            ]}
          />
          <div className="flex gap-2">
            {(['violet', 'pink', 'teal', 'orange', 'blue', 'green'] as Accent[]).map((a) => (
              <button key={a} data-accent={a} onClick={() => s.set({ accent: a })} className={cn('size-7 rounded-full bg-primary ring-offset-2 ring-offset-card', s.accent === a && 'ring-2 ring-primary')} aria-label={a} />
            ))}
          </div>
        </div>
      </Section>

      <AISection />

      <Section icon={<Clock />} title="Giờ làm việc & lịch tự động" desc='Khung giờ rảnh mỗi ngày để AI xếp task. Nhiều khung cách nhau dấu phẩy, VD: "08:00-11:00, 19:00-22:00". Để trống = nghỉ.'>
        <div className="grid gap-2 sm:grid-cols-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-20 text-sm text-muted-foreground">{WD[d]}</span>
              <Input value={s.workHours[d] ?? ''} onChange={(e) => s.set({ workHours: { ...s.workHours, [d]: e.target.value } })} placeholder="Nghỉ" className="h-8 font-mono text-xs" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div>
            <Label>Block tối đa (phút)</Label>
            <Input type="number" min={15} step={15} value={s.maxBlockMin} onChange={(e) => s.set({ maxBlockMin: Math.max(15, +e.target.value || 90) })} />
          </div>
          <div>
            <Label>Buffer trước deadline</Label>
            <Select value={s.bufferPct} onChange={(e) => s.set({ bufferPct: +e.target.value })}>
              <option value={0}>Không</option>
              <option value={20}>Xong sớm 1 ngày</option>
            </Select>
          </div>
          <div>
            <Label>Mục tiêu tập trung / ngày</Label>
            <Input type="number" min={15} step={15} value={s.dailyGoalMin} onChange={(e) => s.set({ dailyGoalMin: Math.max(15, +e.target.value || 120) })} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={s.autoSchedule} onChange={(e) => s.set({ autoSchedule: e.target.checked })} className="size-4 accent-[var(--primary)]" />
            Tự động xếp lịch
          </label>
        </div>
      </Section>

      <Section icon={<Timer />} title="Pomodoro">
        <div className="grid gap-3 sm:grid-cols-4">
          {([
            ['focus', 'Tập trung (phút)'],
            ['short', 'Nghỉ ngắn'],
            ['long', 'Nghỉ dài'],
            ['longEvery', 'Nghỉ dài sau (lần)'],
          ] as const).map(([k, l]) => (
            <div key={k}>
              <Label>{l}</Label>
              <Input type="number" min={1} value={s.pomodoro[k]} onChange={(e) => s.set({ pomodoro: { ...s.pomodoro, [k]: Math.max(1, +e.target.value || 1) } })} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.pomodoro.autoBreak} onChange={(e) => s.set({ pomodoro: { ...s.pomodoro, autoBreak: e.target.checked } })} className="size-4 accent-[var(--primary)]" />
            Tự bắt đầu giờ nghỉ
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.pomodoro.sound} onChange={(e) => s.set({ pomodoro: { ...s.pomodoro, sound: e.target.checked } })} className="size-4 accent-[var(--primary)]" />
            Âm báo
          </label>
          {'Notification' in window && (
            <Button size="sm" variant="outline" onClick={() => void Notification.requestPermission().then((p) => toast(p === 'granted' ? 'Đã bật thông báo' : 'Thông báo bị chặn'))}>
              Bật thông báo
            </Button>
          )}
        </div>
      </Section>

      <SyncSection />

      <Section icon={<Smartphone />} title="Cài như ứng dụng" desc="Cài lên máy tính / điện thoại để mở bằng 1 click, chạy cả khi offline — không cần chạy lại chương trình.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {canInstall ? (
            <Button
              onClick={async () => {
                await deferred?.prompt()
                deferred = null
                setCanInstall(false)
              }}
            >
              <Download /> Cài đặt ứng dụng
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Chrome/Edge: bấm biểu tượng ⊕ "Cài đặt" trên thanh địa chỉ. iPhone (Safari): Chia sẻ → "Thêm vào MH chính". Nếu đã cài, bạn đang dùng bản app rồi 🎉
            </span>
          )}
        </div>
      </Section>

      <DataSection />

      <Section icon={<Keyboard />} title="Phím tắt">
        <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            ['Ctrl/⌘ + K', 'Lệnh nhanh / tìm task'],
            ['N', 'Nhập nhanh bằng AI'],
            ['A', 'Thêm task thủ công'],
            ['T / I / C', 'Hôm nay / Inbox / Lịch'],
            ['F / H', 'Tập trung / Thói quen'],
            ['P / R / M / D', 'Projects / Vai trò / Ma trận / Dashboard'],
            ['Ctrl + Enter', 'Lưu trong form'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-dashed py-1">
              <span className="text-muted-foreground">{v}</span>
              <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">{k}</kbd>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
