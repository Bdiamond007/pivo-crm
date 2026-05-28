import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error('Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) are not set.')
    }
    client = createClient(url, key)
  }
  return client
}

export async function kvGet(key: string): Promise<string | null> {
  const { data, error } = await getClient()
    .from('kv_store')
    .select('value')
    .eq('id', key)
    .single()
  if (error || !data) return null
  return data.value
}

export async function kvSet(key: string, value: string): Promise<void> {
  await getClient()
    .from('kv_store')
    .upsert({ id: key, value, updated_at: new Date().toISOString() })
}

export async function kvDelete(key: string): Promise<void> {
  await getClient().from('kv_store').delete().eq('id', key)
}
