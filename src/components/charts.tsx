import type { ReactNode } from 'react'

/** Validated pair (light+dark): estimate = violet, actual/focus = teal */
export const C_A = '#8b5cf6'
export const C_B = '#0d9488'

export const axisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const

export const gridProps = { stroke: 'var(--border)', strokeDasharray: '3 3', vertical: false } as const

export function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: ReactNode; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular">{fmt ? fmt(Number(p.value)) : p.value}</span>
        </div>
      ))}
    </div>
  )
}
