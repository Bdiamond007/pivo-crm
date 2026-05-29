import { NextRequest, NextResponse } from 'next/server'
import { getOrderByName, getOrdersByEmail, shopifyLive } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/shopify/orders?email=...        -> recent orders for a customer
// GET /api/shopify/orders?order=1001&email -> single order (email-scoped)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const email = searchParams.get('email') || undefined
    const order = searchParams.get('order')

    if (order) {
      const o = await getOrderByName(order, email)
      if (o && email && o.email && o.email.toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ order: null, error: 'Order does not match this email.' }, { status: 403 })
      }
      return NextResponse.json({ order: o, live: shopifyLive })
    }

    if (!email) return NextResponse.json({ error: 'email or order required' }, { status: 400 })
    const orders = await getOrdersByEmail(email)
    return NextResponse.json({ orders, live: shopifyLive })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
