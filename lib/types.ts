export type Zone = 'A' | 'B' | 'C' | 'D' | 'COLD'

export interface Product {
  sku: string
  name: string
  category: string
  zone: Zone
  aisle: number
  bay: number
  onHand: number
  /** units reserved against open orders (not yet shipped) */
  allocated: number
  reorderPoint: number
  reorderQty: number
  unitPrice: number
  /** units on an inbound purchase order */
  incoming: number
}

export type OrderPriority = 'urgent' | 'express' | 'standard'
export type CustomerTier = 'vip' | 'business' | 'retail'

export type OrderStage =
  | 'created'
  | 'allocated'
  | 'picking'
  | 'packing'
  | 'qc'
  | 'dispatch'
  | 'delivered'
  | 'backorder'

export interface OrderLine {
  sku: string
  qty: number
  /** units reserved for this line */
  allocated: number
  /** units physically picked */
  picked: number
}

export interface Order {
  id: string
  customer: string
  tier: CustomerTier
  priority: OrderPriority
  createdAt: number
  /** ship-by deadline (ms epoch) */
  slaAt: number
  lines: OrderLine[]
  stage: OrderStage
  /** computed priority score, higher = more urgent */
  score: number
  /** human-readable decision trail */
  trail: string[]
}

export type ExceptionType =
  | 'out-of-stock'
  | 'low-stock'
  | 'damaged'
  | 'missing'
  | 'sla-risk'

export type Severity = 'high' | 'medium' | 'low'

export interface ExceptionOption {
  label: string
  /** the decision the system recommends */
  recommended?: boolean
  detail: string
}

export interface Exception {
  id: string
  type: ExceptionType
  severity: Severity
  sku?: string
  orderId?: string
  title: string
  detail: string
  createdAt: number
  resolved: boolean
  resolution?: string
  options: ExceptionOption[]
}

export interface LogEntry {
  id: string
  at: number
  kind: 'allocation' | 'reorder' | 'stage' | 'exception' | 'system'
  message: string
  emphasis?: 'good' | 'warn' | 'bad'
}

export interface WarehouseState {
  now: number
  products: Product[]
  orders: Order[]
  exceptions: Exception[]
  log: LogEntry[]
  seq: number
}
