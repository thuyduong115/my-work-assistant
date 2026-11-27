/**
 * Build-time defaults, read from the repository variables
 * (Settings → Secrets and variables → Actions → Variables):
 * VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GOOGLE_CLIENT_ID.
 * When a variable is empty, whatever this device already saved is kept.
 */
export const DEFAULT_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const DEFAULT_SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
export const DEFAULT_GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()
