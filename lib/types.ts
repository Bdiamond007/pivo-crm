// ============================================================================
// Shared domain types for the AI-powered Shopify Support Portal
// ============================================================================

export type Role = 'customer' | 'assistant' | 'system' | 'agent'

export type Sentiment = 'positive' | 'neutral' | 'frustrated' | 'angry'

export type Intent =
  | 'order_status'
  | 'track_shipment'
  | 'refund_return'
  | 'report_issue'
  | 'product_recommendation'
  | 'general_question'
  | 'human_request'
  | 'unknown'

export type TicketStatus = 'open' | 'pending' | 'escalated' | 'resolved' | 'closed'

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

// Human-in-the-loop refund approval. The AI files a `pending` request; an admin
// approves/denies; approval triggers execution (real Shopify refund in live
// mode, simulated in demo). Money never moves without `approved`.
export type RefundStatus = 'pending' | 'approved' | 'denied' | 'processed' | 'failed'

export interface RefundRequest {
  id: string
  conversationId: string | null
  orderName: string
  customerEmail: string | null
  amount: number | null
  currency: string
  reason: string
  status: RefundStatus
  decidedBy: string | null
  note: string | null        // execution note / failure reason
  createdAt: string
  decidedAt: string | null
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  createdAt: string
  // Optional structured metadata produced by the AI engine.
  toolCalls?: ToolCall[]
  confidence?: number       // 0..1 — how sure the AI is about its answer
  sentiment?: Sentiment
  intent?: Intent
  escalate?: boolean
}

export interface ToolCall {
  name: string
  args: Record<string, any>
  result?: any
}

export interface Conversation {
  id: string
  customerEmail: string | null
  customerName: string | null
  shopifyCustomerId: string | null
  status: TicketStatus
  priority: TicketPriority
  intent: Intent
  sentiment: Sentiment
  // Rolling AI confidence — drives "AI confidence scoring" in the admin view.
  confidence: number
  // Short AI-generated summary surfaced in the admin inbox.
  summary: string
  // True once a human agent has taken over.
  humanTakeover: boolean
  assignedAgent: string | null
  tags: string[]
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

// ---- Shopify domain ----

export interface ShopifyMoney {
  amount: string
  currencyCode: string
}

export interface ShopifyLineItem {
  id: string
  title: string
  quantity: number
  price: string
  variantTitle?: string
  fulfillableQuantity?: number
  imageUrl?: string
}

export interface ShopifyFulfillment {
  status: string
  trackingCompany?: string
  trackingNumber?: string
  trackingUrl?: string
  estimatedDelivery?: string
  shippedAt?: string
}

export interface ShopifyOrder {
  id: string
  name: string                 // e.g. "#1001"
  email: string | null
  createdAt: string
  financialStatus: string      // paid, refunded, partially_refunded ...
  fulfillmentStatus: string    // fulfilled, partial, unfulfilled
  totalPrice: string
  currency: string
  lineItems: ShopifyLineItem[]
  fulfillments: ShopifyFulfillment[]
  refundable: boolean
  daysSincePurchase: number
}

export interface ShopifyCustomer {
  id: string
  email: string
  firstName: string
  lastName: string
  ordersCount: number
  totalSpent: string
  tags: string[]
  createdAt: string
}

export interface ShopifyProduct {
  id: string
  title: string
  handle: string
  price: string
  available: boolean
  imageUrl?: string
  productType?: string
  tags?: string[]
}
