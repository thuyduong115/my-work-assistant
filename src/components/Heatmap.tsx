import { addDays, startOfWeek, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { dayKey, fromDayKey } from '@/lib/utils'

/** GitHub-style contribution heatmap */
export function Heatmap({
  values,
  weeks = 26,
  color = 'var(--primary)',
  max,
  label = (v: number) => `${v}`,
  cell = 12,
}: {
  values: Map<string, number>
  weeks?: number
  color?: string
  max?: number
  label?: (v: number) => string
  cell?: number
}) {
  const today = new Date()
  const start = startOfWeek(addDays(today, -7 * (weeks - 1)), { weekStartsOn: 1 })
  const m = max ?? Math.max(1, ...values.values())
  const cols: { k: string; v: number; future: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const k = dayKey(date)
      col.push({ k, v: values.get(k) ?? 0, future: date > today })
    }
    cols.push(col)
  }
  const gap = 3
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]" style={{ minWidth: weeks * (cell + gap) }}>
        <div className="mr-1 flex flex-col gap-[3px] text-[9px] text-muted-foreground" style={{ lineHeight: `${cell}px` }}>
          {['T2', '', 'T4', '', 'T6', '', 'CN'].map((d, i) => (
            <span key={i} style={{ height: cell }}>
              {d}
            </span>
          ))}
        </div>
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((c) => (
              <div
                key={c.k}
                title={`${format(fromDayKey(c.k), 'EEE dd/MM', { locale: vi })}: ${label(c.v)}`}
                className="rounded-[3px]"
                style={{
                  width: cell,
                  height: cell,
                  opacity: c.future ? 0.25 : 1,
                  background: c.v > 0 ? `color-mix(in oklch, ${color} ${Math.round(25 + 75 * Math.min(1, c.v / m))}%, var(--muted))` : 'var(--muted)',
                  outline: c.k === dayKey() ? '1.5px solid var(--foreground)' : undefined,
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
