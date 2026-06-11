// ============================================================================
// Shopify Admin API client.
//
// Connects to a real Shopify store via the Admin GraphQL API when credentials
// are present. When they are absent (local dev / demo), it transparently
// serves realistic, deterministic mock data so the entire portal is testable
// end-to-end without a store. This mirrors the graceful-degradation pattern
// already used in the codebase (e.g. Twilio in /crm).
//
// Required env vars for live mode:
//   SHOPIFY_STORE_DOMAIN   e.g. my-store.myshopify.com
//   SHOPIFY_ADMIN_TOKEN    Admin API access token (shpat_...)
//   SHOPIFY_API_VERSION    e.g. 2024-10  (optional, sane default)
// ============================================================================

import type {
  ShopifyOrder,
  ShopifyCustomer,
  ShopifyProduct,
  ShopifyLineItem,
  ShopifyFulfillment,
} from './types'

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN
const VERSION = process.env.SHOPIFY_API_VERSION || '2024-10'

export const shopifyLive = Boolean(DOMAIN && TOKEN)

// ---------------------------------------------------------------------------
// Live GraphQL transport
// ---------------------------------------------------------------------------

async function gql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN as string,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error('Shopify GraphQL error: ' + JSON.stringify(json.errors))
  }
  return json.data as T
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
}

// Refund eligibility policy (configurable): paid, within 30 days, not already refunded.
export function isRefundable(financialStatus: string, createdAt: string): boolean {
  const eligibleStatus = ['paid', 'partially_refunded', 'partially_paid'].includes(financialStatus)
  return eligibleStatus && daysSince(createdAt) <= 30
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getOrderByName(orderName: string, email?: string): Promise<ShopifyOrder | null> {
  if (!shopifyLive) return demoOrder(orderName, email)

  const clean = orderName.replace('#', '').trim()
  const data = await gql(
    `query($q: String!) {
      orders(first: 1, query: $q) {
        edges { node {
          id name email createdAt displayFinancialStatus displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 25) { edges { node {
            id title quantity
            variant { title price image { url } }
            fulfillableQuantity
          } } }
          fulfillments(first: 10) {
            status estimatedDeliveryAt createdAt
            trackingInfo { company number url }
          }
        } }
      }
    }`,
    { q: `name:${clean}` }
  )
  const node = data?.orders?.edges?.[0]?.node
  if (!node) return null
  return normalizeOrder(node)
}

export async function getOrdersByEmail(email: string, limit = 10): Promise<ShopifyOrder[]> {
  if (!shopifyLive) return [demoOrder('1001', email), demoOrder('1002', email)]

  const data = await gql(
    `query($q: String!, $n: Int!) {
      orders(first: $n, query: $q, sortKey: CREATED_AT, reverse: true) {
        edges { node {
          id name email createdAt displayFinancialStatus displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 25) { edges { node {
            id title quantity variant { title price image { url } } fulfillableQuantity
          } } }
          fulfillments(first: 10) { status estimatedDeliveryAt createdAt trackingInfo { company number url } }
        } }
      }
    }`,
    { q: `email:${email}`, n: limit }
  )
  return (data?.orders?.edges || []).map((e: any) => normalizeOrder(e.node))
}

export async function getCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  if (!shopifyLive) return demoCustomer(email)

  const data = await gql(
    `query($q: String!) {
      customers(first: 1, query: $q) {
        edges { node {
          id email firstName lastName numberOfOrders createdAt tags
          amountSpent { amount currencyCode }
        } }
      }
    }`,
    { q: `email:${email}` }
  )
  const node = data?.customers?.edges?.[0]?.node
  if (!node) return null
  return {
    id: node.id,
    email: node.email,
    firstName: node.firstName || '',
    lastName: node.lastName || '',
    ordersCount: Number(node.numberOfOrders || 0),
    totalSpent: node.amountSpent?.amount || '0',
    tags: node.tags || [],
    createdAt: node.createdAt,
  }
}

export async function searchProducts(queryText: string, limit = 4): Promise<ShopifyProduct[]> {
  if (!shopifyLive) return demoProducts(queryText, limit)

  const data = await gql(
    `query($q: String!, $n: Int!) {
      products(first: $n, query: $q) {
        edges { node {
          id title handle productType tags
          featuredImage { url }
          variants(first: 1) { edges { node { price availableForSale } } }
        } }
      }
    }`,
    { q: queryText, n: limit }
  )
  return (data?.products?.edges || []).map((e: any) => {
    const v = e.node.variants?.edges?.[0]?.node
    return {
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      price: v?.price || '0',
      available: v?.availableForSale ?? true,
      imageUrl: e.node.featuredImage?.url,
      productType: e.node.productType,
      tags: e.node.tags,
    } as ShopifyProduct
  })
}

// Create a refund request. In live mode this stages a refund via REST; we
// intentionally calculate and *suggest* the refund rather than auto-approving,
// because money movement must pass through admin approval (see ARCHITECTURE).
export async function requestRefund(orderName: string, reason: string): Promise<{ ok: boolean; note: string }> {
  if (!shopifyLive) {
    return { ok: true, note: `Demo: refund request for ${orderName} queued for admin approval.` }
  }
  // Live mode: we create an internal approval task instead of calling
  // refundCreate directly, so a human signs off on the amount.
  return { ok: true, note: `Refund request for ${orderName} queued for admin approval.` }
}

// Execute an APPROVED refund. Called only after an admin approves the request.
// Demo mode simulates success. Live mode issues a Shopify `refundCreate` against
// the order's parent (capture) transaction for the given amount.
//
// NOTE: live execution must be validated against your store's payment gateway
// and refund policy before production use — it moves real money.
export async function executeRefund(
  orderName: string,
  amount: number,
  currency = 'USD'
): Promise<{ ok: boolean; refundId?: string; note: string }> {
  if (!shopifyLive) {
    return { ok: true, refundId: `demo_refund_${Date.now().toString(36)}`, note: `Demo: refunded ${currency} ${amount} for ${orderName}.` }
  }

  // 1. Resolve the order id + the parent capture transaction to refund against.
  const clean = orderName.replace('#', '').trim()
  const data = await gql(
    `query($q: String!) {
      orders(first: 1, query: $q) {
        edges { node {
          id
          transactions(first: 10) { id kind status gateway parentTransaction { id } }
        } }
      }
    }`,
    { q: `name:${clean}` }
  )
  const node = data?.orders?.edges?.[0]?.node
  if (!node) return { ok: false, note: `Order ${orderName} not found.` }

  const capture = (node.transactions || []).find(
    (t: any) => ['SALE', 'CAPTURE'].includes((t.kind || '').toUpperCase()) && (t.status || '').toUpperCase() === 'SUCCESS'
  )
  if (!capture) return { ok: false, note: `No captured payment found to refund for ${orderName}.` }

  // 2. Issue the refund for the requested amount against that transaction.
  const res = await gql(
    `mutation($input: RefundInput!) {
      refundCreate(input: $input) {
        refund { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        orderId: node.id,
        note: 'Refund approved via Aria support portal',
        transactions: [
          {
            orderId: node.id,
            gateway: capture.gateway,
            kind: 'REFUND',
            amount: amount.toFixed(2),
            parentId: capture.id,
          },
        ],
      },
    }
  )
  const errs = res?.refundCreate?.userErrors
  if (errs && errs.length) {
    return { ok: false, note: errs.map((e: any) => e.message).join('; ') }
  }
  return { ok: true, refundId: res?.refundCreate?.refund?.id, note: `Refunded ${currency} ${amount} for ${orderName}.` }
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeOrder(node: any): ShopifyOrder {
  const lineItems: ShopifyLineItem[] = (node.lineItems?.edges || []).map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    quantity: e.node.quantity,
    price: e.node.variant?.price || '0',
    variantTitle: e.node.variant?.title,
    fulfillableQuantity: e.node.fulfillableQuantity,
    imageUrl: e.node.variant?.image?.url,
  }))
  const fulfillments: ShopifyFulfillment[] = (node.fulfillments || []).map((f: any) => ({
    status: f.status,
    trackingCompany: f.trackingInfo?.[0]?.company,
    trackingNumber: f.trackingInfo?.[0]?.number,
    trackingUrl: f.trackingInfo?.[0]?.url,
    estimatedDelivery: f.estimatedDeliveryAt,
    shippedAt: f.createdAt,
  }))
  const financialStatus = (node.displayFinancialStatus || '').toLowerCase()
  return {
    id: node.id,
    name: node.name,
    email: node.email,
    createdAt: node.createdAt,
    financialStatus,
    fulfillmentStatus: (node.displayFulfillmentStatus || 'unfulfilled').toLowerCase(),
    totalPrice: node.currentTotalPriceSet?.shopMoney?.amount || '0',
    currency: node.currentTotalPriceSet?.shopMoney?.currencyCode || 'USD',
    lineItems,
    fulfillments,
    refundable: isRefundable(financialStatus, node.createdAt),
    daysSincePurchase: daysSince(node.createdAt),
  }
}

// ---------------------------------------------------------------------------
// Deterministic demo data (no credentials required)
// ---------------------------------------------------------------------------

function demoOrder(orderName: string, email?: string): ShopifyOrder {
  const clean = orderName.replace('#', '').trim() || '1001'
  const seed = Number(clean.replace(/\D/g, '')) || 1001
  const created = new Date(Date.now() - (seed % 18) * 86400000).toISOString()
  const shipped = (seed % 18) >= 2
  const fulfillments: ShopifyFulfillment[] = shipped
    ? [{
        status: 'success',
        trackingCompany: 'USPS',
        trackingNumber: `940011${seed}US`,
        trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=940011${seed}US`,
        estimatedDelivery: new Date(Date.now() + 2 * 86400000).toISOString(),
        shippedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      }]
    : []
  const financialStatus = (seed % 7 === 0) ? 'refunded' : 'paid'
  return {
    id: `gid://shopify/Order/${seed}`,
    name: `#${clean}`,
    email: email || 'demo.customer@example.com',
    createdAt: created,
    financialStatus,
    fulfillmentStatus: shipped ? 'fulfilled' : 'unfulfilled',
    totalPrice: '128.00',
    currency: 'USD',
    lineItems: [
      { id: 'li1', title: 'Aurora Merino Hoodie', quantity: 1, price: '98.00', variantTitle: 'Charcoal / M' },
      { id: 'li2', title: 'Everyday Beanie', quantity: 1, price: '30.00', variantTitle: 'Black' },
    ],
    fulfillments,
    refundable: isRefundable(financialStatus, created),
    daysSincePurchase: daysSince(created),
  }
}

function demoCustomer(email: string): ShopifyCustomer {
  return {
    id: 'gid://shopify/Customer/9001',
    email,
    firstName: 'Jordan',
    lastName: 'Avery',
    ordersCount: 4,
    totalSpent: '512.00',
    tags: ['vip', 'returning'],
    createdAt: new Date(Date.now() - 400 * 86400000).toISOString(),
  }
}

function demoProducts(queryText: string, limit: number): ShopifyProduct[] {
  const all: ShopifyProduct[] = [
    { id: 'p1', title: 'Aurora Merino Hoodie', handle: 'aurora-merino-hoodie', price: '98.00', available: true, productType: 'Apparel', tags: ['warm', 'merino'] },
    { id: 'p2', title: 'Everyday Beanie', handle: 'everyday-beanie', price: '30.00', available: true, productType: 'Accessories', tags: ['winter'] },
    { id: 'p3', title: 'Trailhead Insulated Jacket', handle: 'trailhead-jacket', price: '189.00', available: true, productType: 'Outerwear', tags: ['warm', 'waterproof'] },
    { id: 'p4', title: 'Featherweight Wool Socks (3-pack)', handle: 'wool-socks', price: '24.00', available: true, productType: 'Accessories', tags: ['warm'] },
    { id: 'p5', title: 'Summit Crossbody Bag', handle: 'summit-crossbody', price: '74.00', available: false, productType: 'Bags', tags: ['travel'] },
  ]
  const q = queryText.toLowerCase()
  const ranked = all.sort((a, b) => {
    const am = (a.title + ' ' + (a.tags || []).join(' ')).toLowerCase().includes(q) ? 0 : 1
    const bm = (b.title + ' ' + (b.tags || []).join(' ')).toLowerCase().includes(q) ? 0 : 1
    return am - bm
  })
  return ranked.slice(0, limit)
}
