// ============================================================================
// Tool-calling architecture: the bridge between the LLM and Shopify.
// Each tool has (a) an OpenAI function schema and (b) an executor.
// This is the only way the AI can touch real data — keeping it grounded.
// ============================================================================

import {
  getOrderByName,
  getOrdersByEmail,
  getCustomerByEmail,
  searchProducts,
  requestRefund,
} from '../shopify'

export interface ToolDef {
  schema: any // OpenAI tools[] entry
  run: (args: any, ctx: ToolContext) => Promise<any>
}

export interface ToolContext {
  customerEmail: string | null
}

export const TOOLS: Record<string, ToolDef> = {
  lookup_order: {
    schema: {
      type: 'function',
      function: {
        name: 'lookup_order',
        description:
          'Look up a single Shopify order by its order number (e.g. "#1001"). Returns status, items, totals, and fulfillment/tracking info.',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string', description: 'The order number, with or without #.' },
          },
          required: ['orderNumber'],
        },
      },
    },
    run: async (args, ctx) => {
      const order = await getOrderByName(args.orderNumber, ctx.customerEmail || undefined)
      if (!order) return { found: false }
      // Security: only expose an order if it belongs to the authenticated email
      // (when we have one). Prevents order-number enumeration.
      if (ctx.customerEmail && order.email && order.email.toLowerCase() !== ctx.customerEmail.toLowerCase()) {
        return { found: false, note: 'Order does not match the authenticated customer.' }
      }
      return { found: true, order }
    },
  },

  list_orders: {
    schema: {
      type: 'function',
      function: {
        name: 'list_orders',
        description: "List the authenticated customer's recent orders. Use when they don't know their order number.",
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    run: async (_args, ctx) => {
      if (!ctx.customerEmail) return { orders: [], note: 'Customer is not authenticated.' }
      const orders = await getOrdersByEmail(ctx.customerEmail)
      return { orders }
    },
  },

  track_shipment: {
    schema: {
      type: 'function',
      function: {
        name: 'track_shipment',
        description: 'Get tracking/fulfillment details for an order number.',
        parameters: {
          type: 'object',
          properties: { orderNumber: { type: 'string' } },
          required: ['orderNumber'],
        },
      },
    },
    run: async (args, ctx) => {
      const order = await getOrderByName(args.orderNumber, ctx.customerEmail || undefined)
      if (!order) return { found: false }
      return {
        found: true,
        fulfillmentStatus: order.fulfillmentStatus,
        fulfillments: order.fulfillments,
      }
    },
  },

  check_refund_eligibility: {
    schema: {
      type: 'function',
      function: {
        name: 'check_refund_eligibility',
        description: 'Check whether an order is eligible for a refund/return under policy (paid, within 30 days).',
        parameters: {
          type: 'object',
          properties: { orderNumber: { type: 'string' } },
          required: ['orderNumber'],
        },
      },
    },
    run: async (args, ctx) => {
      const order = await getOrderByName(args.orderNumber, ctx.customerEmail || undefined)
      if (!order) return { found: false }
      return {
        found: true,
        eligible: order.refundable,
        daysSincePurchase: order.daysSincePurchase,
        financialStatus: order.financialStatus,
        reason: order.refundable
          ? 'Within the 30-day window and paid.'
          : 'Outside the 30-day window or not in a refundable state — needs a human to review.',
      }
    },
  },

  request_refund: {
    schema: {
      type: 'function',
      function: {
        name: 'request_refund',
        description:
          'Submit a refund/return request for admin approval. Does NOT move money — it creates an approval task. Always check eligibility first.',
        parameters: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string' },
            reason: { type: 'string', description: 'Why the customer wants a refund.' },
          },
          required: ['orderNumber', 'reason'],
        },
      },
    },
    run: async (args) => {
      const res = await requestRefund(args.orderNumber, args.reason)
      return res
    },
  },

  recommend_products: {
    schema: {
      type: 'function',
      function: {
        name: 'recommend_products',
        description: 'Search the live product catalog to recommend products to the customer.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What the customer is looking for, e.g. "warm winter jacket".' },
          },
          required: ['query'],
        },
      },
    },
    run: async (args) => {
      const products = await searchProducts(args.query)
      return { products }
    },
  },

  get_customer_profile: {
    schema: {
      type: 'function',
      function: {
        name: 'get_customer_profile',
        description: "Fetch the authenticated customer's profile (order count, lifetime value, tags).",
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    run: async (_args, ctx) => {
      if (!ctx.customerEmail) return { found: false }
      const customer = await getCustomerByEmail(ctx.customerEmail)
      return customer ? { found: true, customer } : { found: false }
    },
  },

  escalate_to_human: {
    schema: {
      type: 'function',
      function: {
        name: 'escalate_to_human',
        description:
          'Hand the conversation to a human agent. Use for angry customers, money disputes, or anything outside your tools.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            priority: { type: 'string', enum: ['normal', 'high', 'urgent'] },
          },
          required: ['reason'],
        },
      },
    },
    run: async (args) => {
      return { escalated: true, reason: args.reason, priority: args.priority || 'high' }
    },
  },
}

export const TOOL_SCHEMAS = Object.values(TOOLS).map((t) => t.schema)
