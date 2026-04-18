import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
