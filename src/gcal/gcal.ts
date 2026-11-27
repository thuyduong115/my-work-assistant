import { DEFAULT_GOOGLE_CLIENT_ID } from '@/config'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays } from 'date-fns'
import { db } from '@/db/db'
import { dayKey, hhmmToMin } from '@/lib/utils'
import type { PlanBlock } from '@/db/types'
import { useSettings } from '@/stores/settings'

/** Google Calendar integration — 100% in the browser via Google Identity Services */

const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly'
const API = 'https://www.googleapis.com/calendar/v3'
const PULL_PAST_DAYS = 7
const PULL_FUTURE_DAYS = 60
const PUSH_DAYS = 30

export interface GEvent {
  id: string
  calendarId: string
  title: string
  start: number
  end: number
  allDay: boolean
  /** YYYY-MM-DD for all-day events */
  date?: string
  endDate?: string
  color: string
  link?: string
}

export interface GCalendar {
  id: string
  summary: string
  color: string
  primary?: boolean
  canWrite: boolean
}

interface GState {
  clientId: string
  connected: boolean
  email?: string
  calendars: GCalendar[]
  /** calendars whose events are imported */
  selected: string[]
  /** push task plan blocks as events */
  exportEnabled: boolean
  exportCalendarId: string
  events: GEvent[]
  lastSync?: number
  status: 'idle' | 'syncing' | 'error' | 'need-auth'
  error?: string
  set: (p: Partial<Omit<GState, 'set'>>) => void
}

export const useGCal = create<GState>()(
  persist(
    (set) => ({
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      connected: false,
      calendars: [],
      selected: [],
      exportEnabled: true,
      exportCalendarId: 'primary',
      events: [],
      status: 'idle',
      set: (p) => set(p),
    }),
    {
      name: 'mwa-gcal',
      partialize: (s) => ({ ...s, status: 'idle' as const, error: undefined }),
      merge: (persisted, current) => {
        const m = { ...current, ...(persisted as object) }
        // the built-in client replaces an older one saved here (the previous client was deleted)
        if (current.clientId && m.clientId !== current.clientId) m.clientId = current.clientId
        return m
      },
    },
  ),
)

// ---------- auth ----------

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void
  callback: (r: TokenResponse) => void
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; hint?: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient; revoke: (t: string, cb?: () => void) => void } } }
  }
}

let gisLoading: Promise<void> | null = null
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  gisLoading ??= new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => res()
    s.onerror = () => {
      gisLoading = null
      rej(new Error('Không tải được Google Sign-In (kiểm tra mạng / trình chặn quảng cáo).'))
    }
    document.head.appendChild(s)
  })
  return gisLoading
}

const TOKEN_KEY = 'mwa-gcal-token'
function cachedToken(): string | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; exp: number } | null
    return t && t.exp > Date.now() + 60_000 ? t.token : null
  } catch {
    return null
  }
}

/** Get an access token. Interactive = may open Google's popup (must follow a click). */
export async function getToken(interactive: boolean): Promise<string> {
  const c = cachedToken()
  if (c) return c
  if (!interactive) {
    useGCal.getState().set({ status: 'need-auth' })
    throw new Error('NEED_AUTH')
  }
  const { clientId } = useGCal.getState()
  if (!clientId) throw new Error('Chưa nhập Google OAuth Client ID (Cài đặt → Google Calendar).')
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: SCOPES,
      // pre-selects the connected account so renewing is one click
      hint: useGCal.getState().email,
      callback: (r) => {
        if (r.error || !r.access_token)
          return reject(
            new Error(
              r.error === 'access_denied'
                ? 'Google từ chối quyền truy cập. Nếu ứng dụng OAuth đang ở chế độ "Testing": Google Cloud → OAuth consent screen → Test users → thêm email của bạn.'
                : r.error_description || r.error || 'Google từ chối đăng nhập',
            ),
          )
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 }))
        resolve(r.access_token)
      },
      error_callback: (e) =>
        reject(
          new Error(
            e.type === 'popup_closed'
              ? 'Bạn đã đóng cửa sổ đăng nhập Google.'
              : e.type === 'popup_failed_to_open'
                ? 'Trình duyệt chặn cửa sổ đăng nhập Google — cho phép popup cho trang này (biểu tượng ở cuối thanh địa chỉ) rồi thử lại.'
                : e.message || e.type,
          ),
        ),
    })
    client.requestAccessToken({ prompt: useGCal.getState().connected ? '' : 'consent' })
  })
}

async function api<T>(path: string, init: RequestInit = {}, interactive = false): Promise<T> {
  const token = await getToken(interactive)
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    useGCal.getState().set({ status: 'need-auth' })
    throw new Error('NEED_AUTH')
  }
  if (res.status === 204) return undefined as T
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg: string = j?.error?.message ?? `HTTP ${res.status}`
    if (/has not been used|disabled/i.test(msg)) throw new Error('Chưa bật Google Calendar API trong Google Cloud project. ' + msg)
    throw new Error(msg)
  }
  return j as T
}

export async function connect() {
  await getToken(true)
  const s = useGCal.getState()
  const r = await api<{ items: { id: string; summary: string; backgroundColor?: string; primary?: boolean; accessRole: string }[] }>('/users/me/calendarList?minAccessRole=reader')
  const calendars: GCalendar[] = r.items.map((c) => ({ id: c.id, summary: c.summary, color: c.backgroundColor ?? '#4285f4', primary: c.primary, canWrite: ['owner', 'writer'].includes(c.accessRole) }))
  const primary = calendars.find((c) => c.primary)
  s.set({
    connected: true,
    email: primary?.id,
    calendars,
    selected: s.selected.length ? s.selected.filter((id) => calendars.some((c) => c.id === id)) : primary ? [primary.id] : [],
    status: 'idle',
    error: undefined,
  })
  await syncGcal(true)
}

export function disconnect() {
  const t = cachedToken()
  if (t) window.google?.accounts.oauth2.revoke(t)
  localStorage.removeItem(TOKEN_KEY)
  useGCal.getState().set({ connected: false, events: [], calendars: [], email: undefined, status: 'idle' })
}

// ---------- pull ----------

interface ApiEvent {
  id: string
  status?: string
  summary?: string
  htmlLink?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  transparency?: string
  colorId?: string
  extendedProperties?: { private?: Record<string, string> }
}

async function pullEvents() {
  const s = useGCal.getState()
  const timeMin = addDays(new Date(), -PULL_PAST_DAYS).toISOString()
  const timeMax = addDays(new Date(), PULL_FUTURE_DAYS).toISOString()
  const out: GEvent[] = []
  for (const calId of s.selected) {
    const cal = s.calendars.find((c) => c.id === calId)
    let pageToken: string | undefined
    do {
      const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250', ...(pageToken ? { pageToken } : {}) })
      const r = await api<{ items: ApiEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calId)}/events?${q}`)
      for (const e of r.items) {
        if (e.status === 'cancelled' || e.extendedProperties?.private?.mwa) continue // skip our own task blocks
        const allDay = !!e.start.date
        out.push({
          id: e.id,
          calendarId: calId,
          title: e.summary ?? '(Không tiêu đề)',
          start: allDay ? new Date(e.start.date + 'T00:00').getTime() : new Date(e.start.dateTime!).getTime(),
          end: allDay ? new Date(e.end.date + 'T00:00').getTime() : new Date(e.end.dateTime!).getTime(),
          allDay,
          date: e.start.date,
          endDate: e.end.date,
          color: cal?.color ?? '#4285f4',
          link: e.htmlLink,
        })
      }
      pageToken = r.nextPageToken
    } while (pageToken)
  }
  s.set({ events: out })
}

// ---------- push ----------


function toRFC(date: string, min: number) {
  const d = new Date(`${date}T00:00`)
  d.setMinutes(min)
  return d.toISOString()
}

const LOG_DAYS = 30

/**
 * Google Calendar as a log: only finished tasks, titled "<Project>: <Task>", placed at the
 * time they were actually worked on (timer sessions → the day's planned block → the
 * estimate ending when it was ticked). Older planned "✅" blocks are removed.
 */
async function pushPlan() {
  const s = useGCal.getState()
  if (!s.exportEnabled) return
  const cal = encodeURIComponent(s.exportCalendarId || 'primary')
  const since = Date.now() - LOG_DAYS * 86_400_000
  const all = (await db.tasks.toArray()).filter((t) => !t.deleted)
  const projects = new Map((await db.projects.toArray()).filter((p) => !p.deleted).map((p) => [p.id, p.name]))
  const entries = (await db.timeEntries.toArray()).filter((e) => !e.deleted && e.taskId && e.end > since)
  const want = new Map<string, { title: string; start: string; end: string; taskId: string; note: string }>()
  const iso = (ms: number) => new Date(ms).toISOString()

  for (const t of all) {
    if (t.parentId || t.status !== 'done' || !t.doneAt || t.doneAt < since) continue
    const title = t.projectId && projects.get(t.projectId) ? `${projects.get(t.projectId)}: ${t.title}` : t.title
    const ids = new Set([t.id, ...all.filter((c) => c.parentId === t.id).map((c) => c.id)])
    const sessions = entries.filter((e) => ids.has(e.taskId!)).sort((a, b) => a.start - b.start)
    const spans: [number, number][] = []
    for (const e of sessions) {
      const last = spans[spans.length - 1]
      if (last && e.start - last[1] <= 10 * 60_000) last[1] = Math.max(last[1], e.end)
      else spans.push([e.start, e.end])
    }
    const actual = Math.round(sessions.reduce((a, e) => a + (e.end - e.start), 0) / 60_000)
    const note = `Đã xong ${new Date(t.doneAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · ước lượng ${t.estimateMin}p${actual ? ` · thực tế ${actual}p` : ''}`
    if (spans.length) {
      for (const [a, b] of spans) want.set(`log:${t.id}:${a}`, { title, start: iso(a), end: iso(b), taskId: t.id, note })
      continue
    }
    const doneDay = dayKey(new Date(t.doneAt))
    const blocks = (t.plan ?? []).filter((b) => b.date === doneDay)
    if (blocks.length) {
      for (const b of blocks) want.set(`log:${t.id}:${b.date}:${b.start}`, { title, start: toRFC(b.date, hhmmToMin(b.start)), end: toRFC(b.date, hhmmToMin(b.start) + b.min), taskId: t.id, note })
      continue
    }
    want.set(`log:${t.id}:done`, { title, start: iso(t.doneAt - Math.max(15, t.estimateMin) * 60_000), end: iso(t.doneAt), taskId: t.id, note })
  }

  // events we created earlier (past log + any old planned blocks ahead)
  const have = new Map<string, ApiEvent>()
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({ privateExtendedProperty: 'mwa=1', timeMin: iso(since - 86_400_000), timeMax: addDays(new Date(), PUSH_DAYS + 1).toISOString(), singleEvents: 'true', maxResults: '250', ...(pageToken ? { pageToken } : {}) })
    const r = await api<{ items: ApiEvent[]; nextPageToken?: string }>(`/calendars/${cal}/events?${q}`)
    for (const e of r.items) if (e.status !== 'cancelled') have.set(e.extendedProperties?.private?.key ?? e.id, e)
    pageToken = r.nextPageToken
  } while (pageToken)

  for (const [key, e] of have) {
    const w = want.get(key)
    if (!w || e.colorId) {
      await api(`/calendars/${cal}/events/${e.id}`, { method: 'DELETE' })
      have.delete(key)
    } else if (e.summary !== w.title || new Date(e.start.dateTime ?? 0).toISOString() !== new Date(w.start).toISOString() || new Date(e.end.dateTime ?? 0).toISOString() !== new Date(w.end).toISOString())
      await api(`/calendars/${cal}/events/${e.id}`, { method: 'PATCH', body: JSON.stringify({ summary: w.title, start: { dateTime: w.start }, end: { dateTime: w.end } }) })
  }
  for (const [key, w] of want) {
    if (have.has(key)) continue
    await api(`/calendars/${cal}/events`, {
      method: 'POST',
      body: JSON.stringify({
        summary: w.title,
        description: `${w.note}\nGhi lại bởi My Work Assistant — https://thuyduong115.github.io/my-work-assistant/`,
        start: { dateTime: w.start },
        end: { dateTime: w.end },
        reminders: { useDefault: false, overrides: [] },
        extendedProperties: { private: { mwa: '1', key, taskId: w.taskId } },
      }),
    })
  }
}

let running: Promise<void> | null = null
/** Pull Google events, then push task blocks. Non-interactive unless asked. */
export function syncGcal(interactive = false): Promise<void> {
  const s = useGCal.getState()
  if (!s.connected) return Promise.resolve()
  if (running) return running
  running = (async () => {
    s.set({ status: 'syncing', error: undefined })
    try {
      if (interactive) await getToken(true)
      await pullEvents()
      // re-plan around the fresh busy time before pushing blocks back to Google
      const { runSchedule } = await import('@/lib/autoSchedule')
      if (useSettings.getState().autoSchedule) await runSchedule()
      await pushPlan()
      useGCal.getState().set({ status: 'idle', lastSync: Date.now() })
    } catch (e) {
      const msg = (e as Error).message
      useGCal.getState().set(msg === 'NEED_AUTH' ? { status: 'need-auth' } : { status: 'error', error: msg })
    } finally {
      running = null
    }
  })()
  return running
}

/** Google events overlapping a given day (for calendar views / scheduler) */
export function eventsOn(events: GEvent[], k: string) {
  const start = new Date(`${k}T00:00`).getTime()
  const end = start + 86_400_000
  return events.filter((e) => e.start < end && e.end > start)
}

/** Busy intervals per day in minutes from midnight (timed events only) */
export function busyBlocks(events: GEvent[]): PlanBlock[] {
  const out: PlanBlock[] = []
  for (const e of events) {
    if (e.allDay) continue
    const s = new Date(e.start)
    const k = dayKey(s)
    const startMin = s.getHours() * 60 + s.getMinutes()
    const min = Math.min((e.end - e.start) / 60000, 24 * 60 - startMin)
    out.push({ date: k, start: `${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`, min })
  }
  return out
}
