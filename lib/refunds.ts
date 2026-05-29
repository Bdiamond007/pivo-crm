// ============================================================================
// Refund request persistence — the human-in-the-loop money gate.
//
// Mirrors lib/store.ts: uses the Supabase `refund_requests` table when
// configured, else an in-memory map so the flow works with zero config.
// IDs are valid UUIDs so they're compatible with the table's uuid column AND
// usable as keys in the in-memory fallback.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { RefundRequest, RefundStatus } from './types'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const sb = URL && KEY ? createClient(URL, KEY) : null
const mem = new Map<string, RefundRequest>()
const TABLE = 'refund_requests'

export async function createRefundRequest(partial: Partial<RefundRequest>): Promise<RefundRequest> {
  const rr: RefundRequest = {
    id: partial.id || crypto.randomUUID(),
    conversationId: partial.conversationId ?? null,
    orderName: partial.orderName || '',
    customerEmail: partial.customerEmail ?? null,
    amount: partial.amount ?? null,
    currency: partial.currency || 'USD',
    reason: partial.reason || '',
    status: partial.status || 'pending',
    decidedBy: partial.decidedBy ?? null,
    note: partial.note ?? null,
    createdAt: new Date().toISOString(),
    decidedAt: partial.decidedAt ?? null,
  }
  if (sb) await sb.from(TABLE).insert(rowFrom(rr))
  else mem.set(rr.id, rr)
  return rr
}

export async function listRefundRequests(status?: RefundStatus): Promise<RefundRequest[]> {
  if (sb) {
    let q = sb.from(TABLE).select('*').order('created_at', { ascending: false }).limit(200)
    if (status) q = q.eq('status', status)
    const { data } = await q
    return (data || []).map(refundFrom)
  }
  let list = Array.from(mem.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (status) list = list.filter((r) => r.status === status)
  return list
}

export async function getRefundRequest(id: string): Promise<RefundRequest | null> {
  if (sb) {
    const { data } = await sb.from(TABLE).select('*').eq('id', id).single()
    return data ? refundFrom(data) : null
  }
  return mem.get(id) || null
}

export async function updateRefundRequest(id: string, patch: Partial<RefundRequest>): Promise<RefundRequest | null> {
  const existing = await getRefundRequest(id)
  if (!existing) return null
  const updated: RefundRequest = { ...existing, ...patch, id }
  if (sb) await sb.from(TABLE).update(rowFrom(updated)).eq('id', id)
  else mem.set(id, updated)
  return updated
}

export async function countPendingRefunds(): Promise<number> {
  if (sb) {
    const { count } = await sb.from(TABLE).select('*', { count: 'exact', head: true }).eq('status', 'pending')
    return count ?? 0
  }
  return Array.from(mem.values()).filter((r) => r.status === 'pending').length
}

// ---- row <-> domain mapping ----

function rowFrom(r: RefundRequest) {
  return {
    id: r.id,
    conversation_id: r.conversationId,
    order_name: r.orderName,
    customer_email: r.customerEmail,
    amount: r.amount,
    currency: r.currency,
    reason: r.reason,
    status: r.status,
    decided_by: r.decidedBy,
    note: r.note,
    created_at: r.createdAt,
    decided_at: r.decidedAt,
  }
}

function refundFrom(r: any): RefundRequest {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    orderName: r.order_name,
    customerEmail: r.customer_email,
    amount: r.amount != null ? Number(r.amount) : null,
    currency: r.currency || 'USD',
    reason: r.reason || '',
    status: r.status as RefundStatus,
    decidedBy: r.decided_by,
    note: r.note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}
