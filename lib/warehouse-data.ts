import type { Order, Product, WarehouseState, Zone } from './types'
import { computeScore } from './engine'

const MIN = 60_000
const HOUR = 60 * MIN

interface ProductSeed {
  sku: string
  name: string
  category: string
  zone: Zone
  aisle: number
  bay: number
  onHand: number
  allocated: number
  reorderPoint: number
  reorderQty: number
  unitPrice: number
  incoming: number
}

const PRODUCTS: ProductSeed[] = [
  // Zone A — small electronics (fast movers)
  { sku: 'SKU-1001', name: 'Wireless Earbuds Pro', category: 'Electronics', zone: 'A', aisle: 1, bay: 4, onHand: 7, allocated: 0, reorderPoint: 20, reorderQty: 60, unitPrice: 89.0, incoming: 0 },
  { sku: 'SKU-1002', name: 'USB-C Fast Charger 65W', category: 'Electronics', zone: 'A', aisle: 1, bay: 9, onHand: 140, allocated: 12, reorderPoint: 40, reorderQty: 120, unitPrice: 24.5, incoming: 0 },
  { sku: 'SKU-1003', name: 'Mechanical Keyboard TKL', category: 'Electronics', zone: 'A', aisle: 2, bay: 2, onHand: 0, allocated: 0, reorderPoint: 15, reorderQty: 40, unitPrice: 119.0, incoming: 40 },
  { sku: 'SKU-1004', name: '4K Webcam', category: 'Electronics', zone: 'A', aisle: 2, bay: 7, onHand: 33, allocated: 6, reorderPoint: 12, reorderQty: 30, unitPrice: 74.0, incoming: 0 },

  // Zone B — home goods
  { sku: 'SKU-2001', name: 'Ceramic Pour-Over Set', category: 'Home', zone: 'B', aisle: 3, bay: 1, onHand: 52, allocated: 8, reorderPoint: 18, reorderQty: 50, unitPrice: 42.0, incoming: 0 },
  { sku: 'SKU-2002', name: 'Bamboo Cutting Board', category: 'Home', zone: 'B', aisle: 3, bay: 6, onHand: 9, allocated: 2, reorderPoint: 25, reorderQty: 80, unitPrice: 31.0, incoming: 0 },
  { sku: 'SKU-2003', name: 'Linen Throw Blanket', category: 'Home', zone: 'B', aisle: 4, bay: 3, onHand: 64, allocated: 4, reorderPoint: 20, reorderQty: 60, unitPrice: 58.0, incoming: 0 },
  { sku: 'SKU-2004', name: 'Cast Iron Skillet 12"', category: 'Home', zone: 'B', aisle: 4, bay: 8, onHand: 21, allocated: 5, reorderPoint: 15, reorderQty: 40, unitPrice: 49.0, incoming: 0 },

  // Zone C — apparel
  { sku: 'SKU-3001', name: 'Merino Wool Beanie', category: 'Apparel', zone: 'C', aisle: 5, bay: 2, onHand: 210, allocated: 18, reorderPoint: 50, reorderQty: 150, unitPrice: 22.0, incoming: 0 },
  { sku: 'SKU-3002', name: 'Trail Running Socks (3pk)', category: 'Apparel', zone: 'C', aisle: 5, bay: 5, onHand: 12, allocated: 3, reorderPoint: 40, reorderQty: 120, unitPrice: 18.0, incoming: 0 },
  { sku: 'SKU-3003', name: 'Rain Shell Jacket', category: 'Apparel', zone: 'C', aisle: 6, bay: 1, onHand: 44, allocated: 9, reorderPoint: 15, reorderQty: 45, unitPrice: 129.0, incoming: 0 },

  // Zone D — bulky / sporting
  { sku: 'SKU-4001', name: 'Yoga Mat Premium', category: 'Sporting', zone: 'D', aisle: 7, bay: 3, onHand: 30, allocated: 4, reorderPoint: 20, reorderQty: 50, unitPrice: 45.0, incoming: 0 },
  { sku: 'SKU-4002', name: 'Adjustable Dumbbell 25lb', category: 'Sporting', zone: 'D', aisle: 7, bay: 9, onHand: 6, allocated: 0, reorderPoint: 10, reorderQty: 30, unitPrice: 149.0, incoming: 30 },
  { sku: 'SKU-4003', name: 'Insulated Water Bottle 1L', category: 'Sporting', zone: 'D', aisle: 8, bay: 4, onHand: 88, allocated: 10, reorderPoint: 30, reorderQty: 90, unitPrice: 28.0, incoming: 0 },

  // Cold zone — perishables
  { sku: 'SKU-5001', name: 'Cold-Brew Concentrate', category: 'Grocery', zone: 'COLD', aisle: 9, bay: 2, onHand: 26, allocated: 6, reorderPoint: 24, reorderQty: 72, unitPrice: 16.0, incoming: 0 },
  { sku: 'SKU-5002', name: 'Artisan Cheese Board Kit', category: 'Grocery', zone: 'COLD', aisle: 9, bay: 6, onHand: 4, allocated: 1, reorderPoint: 12, reorderQty: 36, unitPrice: 54.0, incoming: 0 },
]

interface OrderSeed {
  id: string
  customer: string
  tier: Order['tier']
  priority: Order['priority']
  ageMin: number
  slaHours: number
  lines: { sku: string; qty: number }[]
}

const ORDERS: OrderSeed[] = [
  // The headline scenario: urgent order needs 10 earbuds, only 7 available.
  { id: 'ORD-8842', customer: 'Aurora Retail Group', tier: 'vip', priority: 'urgent', ageMin: 22, slaHours: 3, lines: [{ sku: 'SKU-1001', qty: 10 }, { sku: 'SKU-1002', qty: 4 }] },
  { id: 'ORD-8843', customer: 'Bright Home Co.', tier: 'retail', priority: 'standard', ageMin: 95, slaHours: 26, lines: [{ sku: 'SKU-1001', qty: 5 }] },

  { id: 'ORD-8844', customer: 'Northwind Traders', tier: 'business', priority: 'express', ageMin: 40, slaHours: 6, lines: [{ sku: 'SKU-2004', qty: 6 }, { sku: 'SKU-2003', qty: 2 }] },
  { id: 'ORD-8845', customer: 'Summit Outfitters', tier: 'business', priority: 'urgent', ageMin: 12, slaHours: 2, lines: [{ sku: 'SKU-3003', qty: 8 }, { sku: 'SKU-3001', qty: 4 }] },
  { id: 'ORD-8846', customer: 'Cafe Lumen', tier: 'vip', priority: 'express', ageMin: 65, slaHours: 5, lines: [{ sku: 'SKU-5001', qty: 12 }, { sku: 'SKU-5002', qty: 6 }] },
  { id: 'ORD-8847', customer: 'Retailer #4471', tier: 'retail', priority: 'standard', ageMin: 210, slaHours: 30, lines: [{ sku: 'SKU-3002', qty: 9 }] },
  { id: 'ORD-8848', customer: 'FitLife Studios', tier: 'business', priority: 'express', ageMin: 33, slaHours: 7, lines: [{ sku: 'SKU-4001', qty: 10 }, { sku: 'SKU-4003', qty: 12 }] },
  { id: 'ORD-8849', customer: 'GearHead LLC', tier: 'business', priority: 'urgent', ageMin: 8, slaHours: 2, lines: [{ sku: 'SKU-4002', qty: 4 }] },
  { id: 'ORD-8850', customer: 'Downtown Mercantile', tier: 'retail', priority: 'standard', ageMin: 150, slaHours: 28, lines: [{ sku: 'SKU-2001', qty: 6 }, { sku: 'SKU-2002', qty: 4 }] },
  { id: 'ORD-8851', customer: 'Aurora Retail Group', tier: 'vip', priority: 'express', ageMin: 18, slaHours: 4, lines: [{ sku: 'SKU-1004', qty: 5 }, { sku: 'SKU-1002', qty: 3 }] },
  { id: 'ORD-8852', customer: 'Peak Provisions', tier: 'retail', priority: 'standard', ageMin: 120, slaHours: 24, lines: [{ sku: 'SKU-3001', qty: 20 }] },
  { id: 'ORD-8853', customer: 'Harbor Foods', tier: 'business', priority: 'express', ageMin: 50, slaHours: 5, lines: [{ sku: 'SKU-5002', qty: 8 }] },
]

export function buildInitialState(now: number): WarehouseState {
  const products: Product[] = PRODUCTS.map((p) => ({ ...p }))

  const orders: Order[] = ORDERS.map((o) => {
    const createdAt = now - o.ageMin * MIN
    const slaAt = createdAt + o.slaHours * HOUR
    const order: Order = {
      id: o.id,
      customer: o.customer,
      tier: o.tier,
      priority: o.priority,
      createdAt,
      slaAt,
      stage: 'created',
      score: 0,
      trail: [],
      lines: o.lines.map((l) => ({ sku: l.sku, qty: l.qty, allocated: 0, picked: 0 })),
    }
    order.score = computeScore(order, now)
    return order
  })

  return {
    now,
    products,
    orders,
    exceptions: [],
    log: [
      {
        id: 'log-seed',
        at: now,
        kind: 'system',
        message: 'Console initialized. 16 SKUs across 5 zones, 12 open orders staged for allocation.',
      },
    ],
    seq: 1,
  }
}

/** catalog for generating new random orders during simulation */
export const CATALOG_SKUS = PRODUCTS.map((p) => p.sku)
export const CUSTOMERS = [
  'Aurora Retail Group',
  'Northwind Traders',
  'Summit Outfitters',
  'Cafe Lumen',
  'FitLife Studios',
  'Harbor Foods',
  'Peak Provisions',
  'Downtown Mercantile',
]
