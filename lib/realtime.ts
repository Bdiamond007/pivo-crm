'use client'

// ============================================================================
// Browser-side Supabase Realtime helper.
//
// When Supabase is configured (NEXT_PUBLIC_* present), components subscribe to
// postgres_changes and react the instant a row changes. When it isn't, callers
// fall back to polling — so demo mode still works with zero config.
//
// We use Realtime as a lightweight "something changed, refresh now" signal and
// keep the API (service-role reads) as the source of truth, so we never have to
// reconcile raw row payloads on the client.
// ============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const realtimeEnabled = Boolean(url && key)

let _client: SupabaseClient | null = null
function client(): SupabaseClient | null {
  if (!realtimeEnabled) return null
  if (!_client) _client = createClient(url as string, key as string)
  return _client
}

export interface SubscribeOpts {
  filterColumn?: string
  filterValue?: string
}

// Subscribe to changes on one or more tables. Returns an unsubscribe function.
// No-op (returns a noop unsubscribe) when Realtime isn't configured.
export function subscribeToTables(
  tables: string[],
  onChange: () => void,
  opts: SubscribeOpts = {}
): () => void {
  const c = client()
  if (!c) return () => {}

  const channel = c.channel(`aria-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`)
  for (const table of tables) {
    const cfg: any = { event: '*', schema: 'public', table }
    if (opts.filterColumn && opts.filterValue) {
      cfg.filter = `${opts.filterColumn}=eq.${opts.filterValue}`
    }
    channel.on('postgres_changes', cfg, () => onChange())
  }
  channel.subscribe()

  return () => {
    try { c.removeChannel(channel) } catch {}
  }
}
