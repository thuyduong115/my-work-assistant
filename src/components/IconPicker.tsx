import { useEffect, useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppIcon, iconName, isSvgIcon, makeIcon } from './AppIcon'
import { Input } from './ui/input'
import { Segmented } from './ui/misc'

type Weight = 'o' | 'f' | 'd'
type IconSet = Record<string, Partial<Record<Weight, string>>>

let cache: Promise<IconSet> | null = null
function loadIcons() {
  cache ??= fetch(`${import.meta.env.BASE_URL}icons/ph.json`).then((r) => {
    if (!r.ok) throw new Error('icons')
    return r.json()
  })
  cache.catch(() => (cache = null))
  return cache
}

/** Vietnamese → English search hints for common needs */
const VI: Record<string, string> = {
  nước: 'drop', uống: 'drop coffee wine beer', sách: 'book', đọc: 'book', chạy: 'person-simple-run sneaker', thể: 'barbell person', gym: 'barbell',
  ngủ: 'bed moon', thiền: 'flower-lotus', ăn: 'fork-knife bowl', học: 'graduation-cap student book', code: 'code terminal laptop', tiền: 'money wallet coins piggy',
  nhà: 'house', tim: 'heart', sức: 'heartbeat first-aid', thuốc: 'pill', nhạc: 'music', đàn: 'guitar piano', vẽ: 'paint-brush palette', viết: 'pen pencil notebook',
  điện: 'phone', mail: 'envelope', lịch: 'calendar', giờ: 'clock timer alarm', mục: 'target flag', sao: 'star', lửa: 'fire', cây: 'plant tree leaf',
  xe: 'bicycle car', du: 'airplane suitcase', việc: 'briefcase', dự: 'folder kanban', nghiên: 'flask microscope', ngôn: 'translate chat', anh: 'translate',
  dọn: 'broom', mua: 'shopping-cart', cà: 'coffee', trà: 'coffee', gia: 'users', bạn: 'users', con: 'baby', mèo: 'cat', chó: 'dog', nắng: 'sun', mưa: 'cloud-rain',
}

const POPULAR = [
  'drop', 'book-open', 'person-simple-run', 'barbell', 'bed', 'flower-lotus', 'fork-knife', 'graduation-cap', 'code', 'laptop', 'piggy-bank', 'house', 'heart',
  'pill', 'music-notes', 'paint-brush', 'pencil-simple', 'phone', 'calendar-check', 'timer', 'target', 'star', 'fire', 'plant', 'bicycle', 'airplane', 'briefcase',
  'folder', 'flask', 'translate', 'broom', 'shopping-cart', 'coffee', 'users', 'sun', 'moon', 'brain', 'lightbulb', 'rocket', 'trophy', 'check-circle', 'smiley',
  'chart-line-up', 'notebook', 'camera', 'game-controller', 'tooth', 'apple-logo', 'carrot', 'egg', 'cigarette-slash', 'device-mobile-slash', 'hand-heart', 'leaf',
]

const EMOJIS = '💧📚🏃🧘🛌🥗✍️🇬🇧💻🎸🙏🚭☀️🧹💊📵🍎🥛☕🎯🔥⭐🌱🎓💼🔬📝🏠💪✈️💰🎨📈🧠❤️🚀🌸🎵🐱🌙🍀😊👨‍👩‍👧🤝'
const EMOJI_LIST = Array.from(new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(EMOJIS), (s) => s.segment)

export function IconPicker({ value, onChange, color }: { value?: string; onChange: (v: string) => void; color?: string }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'icon' | 'emoji'>(isSvgIcon(value) || !value ? 'icon' : 'emoji')
  const [weight, setWeight] = useState<Weight>(iconName(value)?.endsWith('-fill') ? 'f' : 'o')
  const [q, setQ] = useState('')
  const [set, setSet] = useState<IconSet | null>(null)
  const [err, setErr] = useState(false)
  const [limit, setLimit] = useState(240)

  useEffect(() => {
    if (open && !set) loadIcons().then(setSet, () => setErr(true))
  }, [open, set])

  const names = useMemo(() => {
    if (!set) return []
    const all = Object.keys(set)
    const query = q.trim().toLowerCase()
    if (!query) return [...POPULAR.filter((n) => set[n]), ...all.filter((n) => !POPULAR.includes(n))]
    const words = query.split(/\s+/)
    const extra = words.flatMap((w) => Object.entries(VI).filter(([k]) => k.startsWith(w) || w.startsWith(k)).flatMap(([, v]) => v.split(' ')))
    return all.filter((n) => words.every((w) => n.includes(w)) || extra.some((e) => n.includes(e)))
  }, [set, q])

  const pick = (name: string) => {
    const body = set?.[name]?.[weight] ?? set?.[name]?.o
    if (!body) return
    const suffix = weight === 'f' ? '-fill' : weight === 'd' ? '-duotone' : ''
    onChange(makeIcon(name + suffix, body))
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-dashed transition hover:border-primary"
          style={{ color, background: color ? `color-mix(in oklch, ${color} 14%, transparent)` : undefined }}
          aria-label="Chọn biểu tượng"
        >
          <AppIcon value={value} size={22} fallback="＋" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="animate-pop z-[60] w-[min(92vw,380px)] rounded-xl border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'icon', label: 'Icon' }, { value: 'emoji', label: 'Emoji' }]} />
            {tab === 'icon' && (
              <Segmented
                value={weight}
                onChange={setWeight}
                options={[
                  { value: 'o', label: 'Viền' },
                  { value: 'f', label: 'Đặc' },
                  { value: 'd', label: '2 tông' },
                ]}
              />
            )}
          </div>
          {tab === 'emoji' ? (
            <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
              {EMOJI_LIST.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onChange(e)
                    setOpen(false)
                  }}
                  className={cn('grid aspect-square place-items-center rounded-lg text-xl hover:bg-muted', value === e && 'bg-primary-soft')}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={q} onChange={(e) => (setQ(e.target.value), setLimit(240))} placeholder="Tìm: nước, sách, run, heart…" className="pl-8" />
              </div>
              {!set ? (
                <div className="grid h-60 place-items-center text-sm text-muted-foreground">{err ? 'Không tải được bộ icon (offline?)' : <Loader2 className="size-5 animate-spin" />}</div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-8 gap-1">
                    {names.slice(0, limit).map((n) => {
                      const body = set[n][weight] ?? set[n].o
                      return (
                        <button
                          key={n}
                          type="button"
                          title={n}
                          onClick={() => pick(n)}
                          className={cn('grid aspect-square place-items-center rounded-lg hover:bg-muted', iconName(value)?.replace(/-(fill|duotone)$/, '') === n && 'bg-primary-soft text-primary')}
                        >
                          <svg viewBox="0 0 256 256" width={22} height={22} fill="currentColor" dangerouslySetInnerHTML={{ __html: body ?? '' }} />
                        </button>
                      )
                    })}
                  </div>
                  {names.length > limit && (
                    <button type="button" onClick={() => setLimit(limit + 480)} className="mt-2 w-full rounded-lg py-1.5 text-xs text-primary hover:bg-muted">
                      Xem thêm ({names.length - limit})
                    </button>
                  )}
                  {names.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Không thấy — thử từ tiếng Anh (water, book, run…)</p>}
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">Phosphor Icons · {set ? Object.keys(set).length : '…'} icon × 3 kiểu</p>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
