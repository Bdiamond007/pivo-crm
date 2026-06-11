// ============================================================================
// Conversation / ticket persistence.
//
// Uses a dedicated Supabase `conversations` table when Supabase is configured
// (see db/schema.sql). Falls back to an in-memory store otherwise, so the
// portal runs with zero configuration for local dev and demos.
//
// NOTE: the in-memory fallback is per-process (fine for a single dev server /
// demo). Production uses Supabase + Realtime — see docs/ARCHITECTURE.md.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import type { Conversation, ChatMessage } from './types'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const storeBackend: 'supabase' | 'memory' = URL && KEY ? 'supabase' : 'memory'

const sb = storeBackend === 'supabase' ? createClient(URL as string, KEY as string) : null

// In-memory fallback
const mem = new Map<string, Conversation>()

const TABLE = 'conversations'

// Lightweight health probe for /api/health. On Supabase it does a head-only
// exact count, confirming the table is reachable (schema applied + creds valid)
// without transferring any rows.
export async function storeHealth(): Promise<{
  backend: typeof storeBackend
  reachable: boolean
  count: number | null
}> {
  if (!sb) return { backend: storeBackend, reachable: true, count: mem.size }
  try {
    const { count, error } = await sb.from(TABLE).select('*', { count: 'exact', head: true })
    if (error) return { backend: storeBackend, reachable: false, count: null }
    return { backend: storeBackend, reachable: true, count: count ?? null }
  } catch {
    return { backend: storeBackend, reachable: false, count: null }
  }
}

export function newId(prefix = 'conv'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function createConversation(partial: Partial<Conversation>): Promise<Conversation> {
  const now = new Date().toISOString()
  const conv: Conversation = {
    id: partial.id || newId(),
    customerEmail: partial.customerEmail ?? null,
    customerName: partial.customerName ?? null,
    shopifyCustomerId: partial.shopifyCustomerId ?? null,
    status: partial.status || 'open',
    priority: partial.priority || 'normal',
    intent: partial.intent || 'unknown',
    sentiment: partial.sentiment || 'neutral',
    confidence: partial.confidence ?? 0.7,
    summary: partial.summary || 'New conversation',
    humanTakeover: partial.humanTakeover || false,
    assignedAgent: partial.assignedAgent ?? null,
    tags: partial.tags || [],
    messages: partial.messages || [],
    createdAt: now,
    updatedAt: now,
  }
  if (sb) {
    await sb.from(TABLE).insert(rowFromConv(conv))
  } else {
    mem.set(conv.id, conv)
  }
  return conv
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (sb) {
    const { data } = await sb.from(TABLE).select('*').eq('id', id).single()
    return data ? convFromRow(data) : null
  }
  return mem.get(id) || null
}

export async function listConversations(): Promise<Conversation[]> {
  if (sb) {
    const { data } = await sb.from(TABLE).select('*').order('updated_at', { ascending: false }).limit(200)
    return (data || []).map(convFromRow)
  }
  return Array.from(mem.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function updateConversation(id: string, patch: Partial<Conversation>): Promise<Conversation | null> {
  const existing = await getConversation(id)
  if (!existing) return null
  const updated: Conversation = { ...existing, ...patch, id, updatedAt: new Date().toISOString() }
  if (sb) {
    await sb.from(TABLE).update(rowFromConv(updated)).eq('id', id)
  } else {
    mem.set(id, updated)
  }
  return updated
}

export async function appendMessage(id: string, message: ChatMessage): Promise<Conversation | null> {
  const existing = await getConversation(id)
  if (!existing) return null
  const messages = [...existing.messages, message]
  return updateConversation(id, { messages })
}

// ---- row <-> domain mapping (snake_case columns) ----

function rowFromConv(c: Conversation) {
  return {
    id: c.id,
    customer_email: c.customerEmail,
    customer_name: c.customerName,
    shopify_customer_id: c.shopifyCustomerId,
    status: c.status,
    priority: c.priority,
    intent: c.intent,
    sentiment: c.sentiment,
    confidence: c.confidence,
    summary: c.summary,
    human_takeover: c.humanTakeover,
    assigned_agent: c.assignedAgent,
    tags: c.tags,
    messages: c.messages,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

function convFromRow(r: any): Conversation {
  return {
    id: r.id,
    customerEmail: r.customer_email,
    customerName: r.customer_name,
    shopifyCustomerId: r.shopify_customer_id,
    status: r.status,
    priority: r.priority,
    intent: r.intent,
    sentiment: r.sentiment,
    confidence: Number(r.confidence ?? 0.7),
    summary: r.summary,
    humanTakeover: r.human_takeover,
    assignedAgent: r.assigned_agent,
    tags: r.tags || [],
    messages: r.messages || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
