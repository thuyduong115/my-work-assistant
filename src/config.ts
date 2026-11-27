/**
 * Public, build-time defaults so every device works without typing anything.
 * These values are meant to be public (they ship to every browser): the
 * Supabase publishable key only allows what row-level security permits, and
 * an OAuth client ID is not a secret. Repository variables override them.
 */
export const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wsqfexzfjkgmnpdbault.supabase.co'
export const DEFAULT_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_dnNMksYdMYOw7wQ_-69XTQ_AgETjcIV'
/** OAuth client ID for Google Calendar (public; the client secret is never used in the browser) */
export const DEFAULT_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '788724290281-v1g7f78jgm41rf20ihtdbcg35r8s6mem.apps.googleusercontent.com'
