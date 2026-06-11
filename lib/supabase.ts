import { createClient } from '@supabase/supabase-js'

// Fall back to harmless placeholders when env vars are absent so the app can
// build and run in zero-config demo mode. At runtime, kvGet/kvSet below swallow
// the resulting network errors and return null, so the CRM degrades gracefully.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function kvGet(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('kv_store')
    .select('value')
    .eq('id', key)
    .single()
  if (error || !data) return null
  return data.value
}

export async function kvSet(key: string, value: string): Promise<void> {
  await supabase
    .from('kv_store')
    .upsert({ id: key, value, updated_at: new Date().toISOString() })
}

export async function kvDelete(key: string): Promise<void> {
  await supabase.from('kv_store').delete().eq('id', key)
}
