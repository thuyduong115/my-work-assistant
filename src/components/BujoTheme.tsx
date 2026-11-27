import { useEffect, useState, type CSSProperties } from 'react'
import { Palette, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useJournalRow } from '@/db/hooks'
import { monthId, saveMonth } from '@/db/actions'
import type { BujoThemeSetting } from '@/db/types'
import { BUJO_THEMES, defaultPreset, resolveTheme, seeded, type ResolvedTheme } from '@/lib/bujoThemes'
import { cn, fromDayKey } from '@/lib/utils'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Input, Label } from './ui/input'

export function useMonthTheme(month: string) {
  const row = useJournalRow(monthId(month))
  return { theme: resolveTheme(month, row?.theme), setting: row?.theme }
}

/** CSS variables + paper class for a themed page */
export function themeProps(t: ResolvedTheme): { style: CSSProperties; className: string } {
  return {
    style: { '--bj-accent': t.accent, '--bj-accent2': t.accent2, '--bj-tint': t.tint } as CSSProperties,
    className: `bujo-paper bujo-${t.paper}`,
  }
}

/** Washi tape, corner illustration and stickers scattered along the page edges */
export function ThemeDecor({ theme, seed, big }: { theme: ResolvedTheme; seed: string; big?: boolean }) {
  const rnd = seeded(seed + theme.id)
  const count = theme.stickers.length ? [0, 5, 11][theme.density] : 0
  const stickers = Array.from({ length: count }, (_, i) => {
    const side = i % 3 // 0 left edge, 1 right edge, 2 bottom edge
    const along = 8 + rnd() * 84
    return {
      s: theme.stickers[Math.floor(rnd() * theme.stickers.length)],
      style: {
        ...(side === 0 ? { left: `${-6 + rnd() * 10}px`, top: `${along}%` } : side === 1 ? { right: `${-6 + rnd() * 10}px`, top: `${along}%` } : { bottom: `${-4 + rnd() * 8}px`, left: `${along}%` }),
        fontSize: `${15 + rnd() * 10}px`,
        transform: `rotate(${-35 + rnd() * 70}deg)`,
        opacity: 0.55 + rnd() * 0.35,
      } as CSSProperties,
    }
  })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] select-none">
      {theme.id !== 'minimal' || theme.stickers.length ? (
        <>
          <span className="bujo-washi absolute top-[-7px] left-1/2 h-[26px] w-[130px] -translate-x-1/2 -rotate-2" />
          {big && <span className="bujo-washi absolute top-[18px] right-[-26px] h-[22px] w-[110px] rotate-[38deg]" />}
        </>
      ) : null}
      {theme.corner.length > 0 && (
        <div className={cn('absolute right-1 bottom-0 flex items-end leading-none', big ? 'text-[56px]' : 'text-[40px]')} style={{ opacity: 0.9 }}>
          {theme.corner.map((c, i) => (
            <span key={i} style={{ transform: `rotate(${[-8, 10, -16][i % 3]}deg) translateY(${[0, -14, -4][i % 3]}px)`, fontSize: i === 0 ? '1em' : '0.62em' }}>
              {c}
            </span>
          ))}
        </div>
      )}
      {stickers.map((x, i) => (
        <span key={i} className="absolute leading-none" style={x.style}>
          {x.s}
        </span>
      ))}
    </div>
  )
}

const PAPERS: { id: NonNullable<BujoThemeSetting['paper']>; label: string }[] = [
  { id: 'plain', label: 'Trắng trơn' },
  { id: 'dots', label: 'Chấm bi' },
  { id: 'grid', label: 'Kẻ ô' },
  { id: 'lines', label: 'Kẻ dòng' },
]

/** Pick the month's theme: presets + accent colours, stickers, paper and sticker density */
export function ThemePicker({ month, className }: { month: string; className?: string }) {
  const { theme, setting } = useMonthTheme(month)
  const [open, setOpen] = useState(false)
  const [s, setS] = useState<BujoThemeSetting>({ preset: defaultPreset(month) })
  useEffect(() => {
    if (open) setS(setting ?? { preset: defaultPreset(month) })
  }, [open, setting, month])
  const preview = resolveTheme(month, s)
  const label = format(fromDayKey(`${month}-01`), 'MMMM yyyy', { locale: vi })
  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => setOpen(true)} title="Chủ đề trang trí của tháng">
        <Palette /> {theme.emoji} Chủ đề
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={<span className="capitalize">Chủ đề {label}</span>}
        description="Áp dụng cho mọi trang ngày trong tháng và trang tổng kết tháng. Đồng bộ sang các thiết bị."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" className="mr-auto" onClick={() => setS({ preset: s.preset, paper: s.paper, density: s.density })}>
              <RotateCcw /> Bỏ màu & sticker tự chọn
            </Button>
            <Button
              onClick={async () => {
                await saveMonth(month, { theme: s })
                setOpen(false)
              }}
            >
              Áp dụng
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BUJO_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setS({ ...s, preset: t.id, accent: undefined, accent2: undefined, stickers: undefined })}
                className={cn('relative overflow-hidden rounded-xl border bg-white p-2.5 text-left text-black transition hover:shadow-md', s.preset === t.id && 'ring-2 ring-offset-1')}
                style={s.preset === t.id ? ({ '--tw-ring-color': t.accent } as CSSProperties) : undefined}
              >
                <span className="absolute top-[-4px] left-1/2 h-3 w-14 -translate-x-1/2 -rotate-3 opacity-80" style={{ background: `repeating-linear-gradient(45deg, ${t.accent2} 0 5px, ${t.tint} 5px 10px)` }} />
                <span className="mt-2 block text-2xl leading-none">{t.corner.length ? t.corner.join('') : t.emoji}</span>
                <span className="mt-1.5 block text-xs font-semibold" style={{ color: t.accent }}>
                  {t.name}
                </span>
                <span className="mt-1 flex gap-1">
                  <span className="size-3 rounded-full" style={{ background: t.accent }} />
                  <span className="size-3 rounded-full" style={{ background: t.accent2 }} />
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
            <div className="flex items-end gap-3">
              <div>
                <Label>Màu chính</Label>
                <input type="color" value={preview.accent} onChange={(e) => setS({ ...s, accent: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1" />
              </div>
              <div>
                <Label>Màu phụ (băng dính)</Label>
                <input type="color" value={preview.accent2} onChange={(e) => setS({ ...s, accent2: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1" />
              </div>
            </div>
            <div>
              <Label>Sticker của bạn (emoji, để trống = theo chủ đề)</Label>
              <Input value={s.stickers ?? ''} onChange={(e) => setS({ ...s, stickers: e.target.value })} placeholder={preview.stickers.join(' ') || 'VD: 🍂 🍁 🌰 🍄'} />
            </div>
            <div>
              <Label>Giấy</Label>
              <div className="flex flex-wrap gap-1.5">
                {PAPERS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setS({ ...s, paper: p.id })} className={cn('rounded-lg border px-2.5 py-1 text-xs', (s.paper ?? 'plain') === p.id ? 'border-transparent bg-foreground text-background' : 'hover:bg-muted')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Lượng sticker</Label>
              <div className="flex gap-1.5">
                {(['Không', 'Ít', 'Nhiều'] as const).map((l, i) => (
                  <button key={l} type="button" onClick={() => setS({ ...s, density: i as 0 | 1 | 2 })} className={cn('rounded-lg border px-2.5 py-1 text-xs', (s.density ?? 1) === i ? 'border-transparent bg-foreground text-background' : 'hover:bg-muted')}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>Xem trước</Label>
            <div {...themeProps(preview)} className={cn(themeProps(preview).className, 'relative h-40 overflow-hidden rounded-xl border p-5')}>
              <ThemeDecor theme={preview} seed="preview" />
              <div className="relative z-10 font-hand">
                <div className="bujo-title text-2xl font-bold">Small steps, big results</div>
                <div className="mt-1 text-sm font-semibold" style={{ color: preview.accent }}>
                  thứ hai · 02.11
                </div>
                <div className="mt-2 flex gap-1">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="grid size-5 place-items-center rounded-full text-[10px] text-white" style={{ background: preview.accent }}>
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  )
}
