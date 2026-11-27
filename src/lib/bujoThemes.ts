import type { BujoThemeSetting } from '@/db/types'

export interface BujoTheme {
  id: string
  name: string
  emoji: string
  /** headings, date, ticks */
  accent: string
  /** washi tape, secondary marks */
  accent2: string
  /** very light wash for tape / callouts */
  tint: string
  stickers: string[]
  /** big illustration in the corner */
  corner: string[]
}

export const BUJO_THEMES: BujoTheme[] = [
  { id: 'minimal', name: 'Tối giản', emoji: '✏️', accent: '#ea580c', accent2: '#1f2937', tint: '#fff7ed', stickers: [], corner: [] },
  { id: 'autumn', name: 'Cây mùa thu', emoji: '🍂', accent: '#c2410c', accent2: '#d97706', tint: '#fff7ed', stickers: ['🍂', '🍁', '🌰', '🍄', '🍁', '🍂'], corner: ['🌳', '🍁', '🍂'] },
  { id: 'winter', name: 'Mùa đông tuyết', emoji: '❄️', accent: '#1d4ed8', accent2: '#7dd3fc', tint: '#eff6ff', stickers: ['❄️', '❄️', '⛄', '🧣', '❄️', '☃️'], corner: ['⛄', '❄️', '🌨️'] },
  { id: 'christmas', name: 'Giáng sinh', emoji: '🎄', accent: '#dc2626', accent2: '#15803d', tint: '#fef2f2', stickers: ['🎄', '🎁', '⭐', '🔔', '🍪', '❄️'], corner: ['🎄', '🎁', '⭐'] },
  { id: 'tet', name: 'Tết', emoji: '🧧', accent: '#b91c1c', accent2: '#eab308', tint: '#fef9c3', stickers: ['🧧', '🏮', '🌼', '🎆', '🍊', '🌼'], corner: ['🏮', '🧧', '🌼'] },
  { id: 'spring', name: 'Hoa anh đào', emoji: '🌸', accent: '#db2777', accent2: '#f9a8d4', tint: '#fdf2f8', stickers: ['🌸', '🌷', '🦋', '🌱', '🌸', '🌸'], corner: ['🌸', '🦋', '🌷'] },
  { id: 'garden', name: 'Vườn xanh', emoji: '🌿', accent: '#15803d', accent2: '#84cc16', tint: '#f0fdf4', stickers: ['🌿', '🍃', '🌱', '🐞', '🌼', '🍃'], corner: ['🪴', '🌿', '🐞'] },
  { id: 'summer', name: 'Biển mùa hè', emoji: '🌊', accent: '#0e7490', accent2: '#fbbf24', tint: '#ecfeff', stickers: ['🌊', '🐚', '☀️', '🍉', '🐠', '🏖️'], corner: ['🏖️', '🐚', '☀️'] },
  { id: 'study', name: 'Mùa tựu trường', emoji: '📚', accent: '#2563eb', accent2: '#f59e0b', tint: '#eff6ff', stickers: ['📚', '✏️', '📎', '🎒', '📐', '💡'], corner: ['🎒', '📚', '✏️'] },
  { id: 'coffee', name: 'Cà phê & sách', emoji: '☕', accent: '#92400e', accent2: '#a16207', tint: '#fefce8', stickers: ['☕', '📖', '🍪', '🕯️', '🧸', '☕'], corner: ['☕', '📚', '🕯️'] },
  { id: 'night', name: 'Đêm sao', emoji: '🌙', accent: '#4338ca', accent2: '#a78bfa', tint: '#eef2ff', stickers: ['🌙', '⭐', '✨', '🪐', '🌟', '⭐'], corner: ['🌙', '🪐', '✨'] },
  { id: 'candy', name: 'Kẹo ngọt', emoji: '🍬', accent: '#a855f7', accent2: '#f472b6', tint: '#faf5ff', stickers: ['🍬', '🧁', '🍓', '🎀', '💜', '🍭'], corner: ['🧁', '🎀', '🍓'] },
]

/** Suggested theme when a month has none chosen yet */
const BY_MONTH: Record<number, string> = { 1: 'winter', 2: 'tet', 3: 'spring', 4: 'spring', 5: 'garden', 6: 'summer', 7: 'summer', 8: 'summer', 9: 'study', 10: 'autumn', 11: 'autumn', 12: 'christmas' }
export const defaultPreset = (month: string) => BY_MONTH[Number(month.slice(5, 7))] ?? 'minimal'

export interface ResolvedTheme extends BujoTheme {
  paper: NonNullable<BujoThemeSetting['paper']>
  density: NonNullable<BujoThemeSetting['density']>
}

/** Split an emoji string into stickers (handles multi-codepoint emoji) */
export function splitStickers(s: string) {
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...seg.segment(s)].map((x) => x.segment).filter((x) => x.trim())
  } catch {
    return [...s].filter((x) => x.trim())
  }
}

export function resolveTheme(month: string, setting?: BujoThemeSetting): ResolvedTheme {
  const base = BUJO_THEMES.find((t) => t.id === (setting?.preset ?? defaultPreset(month))) ?? BUJO_THEMES[0]
  const custom = setting?.stickers ? splitStickers(setting.stickers) : []
  return {
    ...base,
    accent: setting?.accent || base.accent,
    accent2: setting?.accent2 || base.accent2,
    stickers: custom.length ? custom : base.stickers,
    corner: custom.length ? custom.slice(0, 3) : base.corner,
    paper: setting?.paper ?? 'plain',
    density: setting?.density ?? 1,
  }
}

/** Small deterministic PRNG so stickers stay put for a given page */
export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
