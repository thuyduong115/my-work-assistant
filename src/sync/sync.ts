import { createClient, type SupabaseClient, type Session, type RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { EntityTable } from 'dexie'
import { db, onLocalChange } from '@/db/db'
import { TABLES, type Base, type TableName } from '@/db/types'
import { useSettings } from '@/stores/settings'

type Status = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline'

interface SyncState {
  status: Status
  error?: string
  lastSync?: number
  session: Session | null
}

export const useSync = create<SyncState>(() => ({ status: 'off', session: null }))

let client: SupabaseClient | null = null
let clientKey = ''
let channel: RealtimeChannel | null = null

export function getClient() {
  const { url, anonKey } = useSettings.getState().supabase
  if (!url || !anonKey) return null
  const k = url + anonKey
  if (client && clientKey === k) return client
  try {
    client = createClient(url.trim(), anonKey.trim(), {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    clientKey = k
  } catch (e) {
    client = null
    useSync.setState({ status: 'error', error: String(e) })
  }
  return client
}

const cursorKey = (uid: string) => `mwa-sync-cursor-${uid}`
const STRIP = new Set(['id', 'updatedAt', 'deleted', 'dirty'])
const ACCOUNT_KEY = 'mwa-sync-account'

/** Queue every local row for upload (e.g. after moving to a new Supabase project) */
export async function markAllDirty() {
  await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
    for (const t of TABLES) await table(t).toCollection().modify({ dirty: 1 })
  })
}

const UNREACHABLE =
  'Không kết nối được Supabase. Thường là project đang bị tạm dừng (gói Free tự dừng sau 7 ngày không dùng) hoặc đã bị xoá: vào supabase.com/dashboard → mở project → "Restore project". Nếu không còn project, tạo project mới và dán URL / anon key mới vào đây — dữ liệu trên máy vẫn còn.'
const isNetworkError = (e: unknown) => /failed to fetch|networkerror|load failed|fetch failed|ERR_NAME_NOT_RESOLVED/i.test((e as { message?: string })?.message ?? String(e))

function table(name: TableName) {
  return db[name] as unknown as EntityTable<Base & Record<string, unknown>, 'id'>
}

let running: Promise<void> | null = null
let again = false

export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = doSync().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

async function doSync() {
  const sb = getClient()
  if (!sb) return useSync.setState({ status: 'off' })
  const session = useSync.getState().session
  if (!session) return useSync.setState({ status: 'signed-out' })
  if (!navigator.onLine) return useSync.setState({ status: 'offline' })
  const userId = session.user.id
  useSync.setState({ status: 'syncing', error: undefined })
  try {
    // New account or new Supabase project: offer everything on this device again.
    // (Done before the pull, so rows the server has in a newer version still win.)
    const account = `${useSettings.getState().supabase.url.trim()}|${userId}`
    if (localStorage.getItem(ACCOUNT_KEY) !== account) {
      await markAllDirty()
      localStorage.setItem(ACCOUNT_KEY, account)
    }
    // ---- pull
    const cursor = localStorage.getItem(cursorKey(userId))
    const since = cursor ? new Date(new Date(cursor).getTime() - 60_000).toISOString() : '1970-01-01T00:00:00Z'
    let maxSeen = cursor ?? since
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from('items')
        .select('id,kind,data,updated_at,deleted,server_updated')
        .gt('server_updated', since)
        .order('server_updated', { ascending: true })
        .range(from, from + 999)
      if (error) throw error
      if (!data?.length) break
      await db.transaction('rw', TABLES.map((t) => db[t]), async () => {
        for (const row of data) {
          if (!TABLES.includes(row.kind as TableName)) continue
          const t = table(row.kind as TableName)
          const local = await t.get(row.id)
          if (local && local.updatedAt >= row.updated_at) continue
          await t.put({ ...(row.data as object), id: row.id, updatedAt: row.updated_at, deleted: row.deleted ? 1 : 0, dirty: 0 })
        }
      })
      maxSeen = data[data.length - 1].server_updated
      if (data.length < 1000) break
    }
    localStorage.setItem(cursorKey(userId), maxSeen)

    // ---- push
    for (const name of TABLES) {
      const t = table(name)
      const dirty = await t.where('dirty').equals(1).toArray()
      for (let i = 0; i < dirty.length; i += 500) {
        const chunk = dirty.slice(i, i + 500)
        const rows = chunk.map((r) => ({
          user_id: userId,
          id: r.id,
          kind: name,
          data: Object.fromEntries(Object.entries(r).filter(([k, v]) => !STRIP.has(k) && v !== undefined)),
          updated_at: r.updatedAt,
          deleted: !!r.deleted,
        }))
        const { error } = await sb.from('items').upsert(rows, { onConflict: 'user_id,id' })
        if (error) throw error
        await db.transaction('rw', t, async () => {
          for (const r of chunk) {
            const cur = await t.get(r.id)
            if (cur && cur.updatedAt === r.updatedAt) await t.update(r.id, { dirty: 0 })
          }
        })
      }
    }
    useSync.setState({ status: 'idle', lastSync: Date.now() })
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e)
    useSync.setState({
      status: 'error',
      error: /relation .*items.* does not exist|Could not find the table/i.test(msg)
        ? 'Chưa tạo bảng "items" — chạy SQL trong Cài đặt → Đồng bộ.'
        : isNetworkError(msg) && navigator.onLine
          ? UNREACHABLE
          : /invalid api key|no api key|jwt/i.test(msg)
            ? 'Anon key không hợp lệ — kiểm tra lại Project URL / anon key trong Cài đặt → Đồng bộ.'
            : msg,
    })
  }
}

function subscribeRealtime(sb: SupabaseClient, userId: string) {
  if (channel) void sb.removeChannel(channel)
  channel = sb
    .channel('items-' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` }, () => schedule(800))
    .subscribe()
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(ms = 2000) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

let started = false
let authSub: { unsubscribe: () => void } | null = null

/** (Re)initialise sync. Call on app start and whenever Supabase settings change. */
export async function initSync() {
  authSub?.unsubscribe()
  const sb = getClient()
  if (!sb) {
    useSync.setState({ status: 'off', session: null })
    return
  }
  const { data } = await sb.auth.getSession()
  useSync.setState({ session: data.session, status: data.session ? 'idle' : 'signed-out' })
  authSub = sb.auth.onAuthStateChange((event, session) => {
    useSync.setState({ session, status: session ? 'idle' : 'signed-out' })
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
      subscribeRealtime(sb, session.user.id)
      schedule(300)
    }
  }).data.subscription
  if (data.session) {
    subscribeRealtime(sb, data.session.user.id)
    schedule(300)
  }
  if (!started) {
    started = true
    onLocalChange(() => schedule(2500))
    setInterval(() => schedule(0), 5 * 60_000)
    window.addEventListener('online', () => schedule(500))
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(500))
  }
}

export async function signIn(email: string, password: string) {
  const sb = getClient()
  if (!sb) throw new Error('Chưa cấu hình Supabase')
  const { error } = await sb.auth.signInWithPassword({ email, password }).catch((e) => ({ error: e as Error }))
  if (error && isNetworkError(error) && navigator.onLine) throw new Error(UNREACHABLE)
  if (error) {
    if (/email not confirmed/i.test(error.message)) throw new Error('EMAIL_NOT_CONFIRMED')
    if (/invalid login credentials/i.test(error.message)) throw new Error('Sai email hoặc mật khẩu (hoặc chưa đăng ký).')
    throw error
  }
}

export async function resendConfirmation(email: string) {
  const sb = getClient()
  if (!sb) throw new Error('Chưa cấu hình Supabase')
  const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin + location.pathname } })
  if (error) throw error
}

export async function signUp(email: string, password: string) {
  const sb = getClient()
  if (!sb) throw new Error('Chưa cấu hình Supabase')
  const { data, error } = await sb.auth
    .signUp({
    email,
    password,
      options: { emailRedirectTo: location.origin + location.pathname },
    })
    .catch((e) => ({ data: { session: null }, error: e as Error }))
  if (error && isNetworkError(error) && navigator.onLine) throw new Error(UNREACHABLE)
  if (error) throw error
  return !!data.session
}

export async function signOut() {
  await getClient()?.auth.signOut()
  if (channel) void client?.removeChannel(channel)
  channel = null
}

export type Counts = Partial<Record<TableName, { alive: number; deleted: number }>>

/** Row counts per kind on the server (for the sync health check) */
export async function serverCounts(): Promise<Counts> {
  const sb = getClient()
  if (!sb || !useSync.getState().session) throw new Error('Chưa đăng nhập')
  const out: Counts = {}
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('items').select('kind,deleted').order('id').range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) {
      const c = (out[r.kind as TableName] ??= { alive: 0, deleted: 0 })
      if (r.deleted) c.deleted++
      else c.alive++
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export async function localCounts(): Promise<Counts> {
  const out: Counts = {}
  for (const t of TABLES) {
    const rows = await table(t).toArray()
    out[t] = { alive: rows.filter((r) => !r.deleted).length, deleted: rows.filter((r) => r.deleted).length }
  }
  return out
}

/** Forget the pull cursor and fetch everything again (keeps whichever copy is newer) */
export async function fullResync() {
  const s = useSync.getState().session
  if (s) localStorage.removeItem(cursorKey(s.user.id))
  // also offer everything on this device; rows the server has in a newer version still win
  await markAllDirty()
  await syncNow()
}

/** Sign in with Google (needs the Google provider enabled in Supabase → Authentication → Sign In / Providers) */
export async function signInWithGoogle() {
  const sb = getClient()
  if (!sb) throw new Error('Chưa cấu hình Supabase')
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }).catch((e) => ({ error: e as Error }))
  if (error && isNetworkError(error) && navigator.onLine) throw new Error(UNREACHABLE)
  if (error) throw new Error(/provider is not enabled|unsupported provider/i.test(error.message) ? 'Chưa bật đăng nhập Google trong Supabase — xem hướng dẫn ngay bên dưới nút.' : error.message)
}

/** Passwordless: email a one-time sign-in link */
export async function sendMagicLink(email: string) {
  const sb = getClient()
  if (!sb) throw new Error('Chưa cấu hình Supabase')
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }).catch((e) => ({ error: e as Error }))
  if (error && isNetworkError(error) && navigator.onLine) throw new Error(UNREACHABLE)
  if (error) throw new Error(/rate limit/i.test(error.message) ? 'Gửi email quá nhiều lần — đợi khoảng 1 giờ hoặc dùng mật khẩu / Google.' : error.message)
}
