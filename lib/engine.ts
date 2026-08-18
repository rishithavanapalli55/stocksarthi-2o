import type {
  Exception,
  ExceptionOption,
  LogEntry,
  Order,
  Product,
  WarehouseState,
} from './types'

const HOUR = 3_600_000

/* ----------------------------- pure helpers ----------------------------- */

export function available(p: Product): number {
  return Math.max(0, p.onHand - p.allocated)
}

export function hoursLeft(order: Order, now: number): number {
  return (order.slaAt - now) / HOUR
}

export type SlaStatus = 'overdue' | 'critical' | 'soon' | 'ok'

export function slaStatus(order: Order, now: number): SlaStatus {
  const h = hoursLeft(order, now)
  if (h < 0) return 'overdue'
  if (h < 2) return 'critical'
  if (h < 6) return 'soon'
  return 'ok'
}

export function orderValue(order: Order, products: Product[]): number {
  return order.lines.reduce((sum, l) => {
    const p = products.find((x) => x.sku === l.sku)
    return sum + (p ? p.unitPrice * l.qty : 0)
  }, 0)
}

/**
 * Priority score — the backbone of every allocation and picking decision.
 * Higher score = handled first.
 */
export function computeScore(order: Order, now: number): number {
  const priorityBase =
    order.priority === 'urgent' ? 1000 : order.priority === 'express' ? 600 : 200

  const tierBonus = order.tier === 'vip' ? 160 : order.tier === 'business' ? 80 : 20

  const h = hoursLeft(order, now)
  let slaUrgency: number
  if (h < 0) slaUrgency = 650 // overdue dominates
  else slaUrgency = Math.round(Math.max(0, 1 - h / 24) * 480)

  const units = order.lines.reduce((s, l) => s + l.qty, 0)
  const sizeBonus = Math.min(units * 2, 120)

  return priorityBase + tierBonus + slaUrgency + sizeBonus
}

export function scoreBreakdown(order: Order, now: number) {
  const priorityBase =
    order.priority === 'urgent' ? 1000 : order.priority === 'express' ? 600 : 200
  const tierBonus = order.tier === 'vip' ? 160 : order.tier === 'business' ? 80 : 20
  const h = hoursLeft(order, now)
  const slaUrgency = h < 0 ? 650 : Math.round(Math.max(0, 1 - h / 24) * 480)
  const units = order.lines.reduce((s, l) => s + l.qty, 0)
  const sizeBonus = Math.min(units * 2, 120)
  return [
    { label: 'Priority tier', value: priorityBase },
    { label: 'SLA urgency', value: slaUrgency },
    { label: 'Customer tier', value: tierBonus },
    { label: 'Order size', value: sizeBonus },
  ]
}

export function fullyAllocated(order: Order): boolean {
  return order.lines.every((l) => l.allocated >= l.qty)
}

/* ------------------------------ id helper ------------------------------- */

function makeId(prefix: string, seq: number) {
  return `${prefix}-${seq}`
}

/* --------------------------- allocation engine --------------------------- */

export interface AllocationResult {
  products: Product[]
  orders: Order[]
  exceptions: Exception[]
  logs: LogEntry[]
  seq: number
}

/**
 * Greedy priority allocation. Walks open orders from highest to lowest score,
 * reserving available stock line-by-line. Records a decision trail explaining
 * every partial fill, hold, and reorder trigger.
 */
export function runAllocation(state: WarehouseState): AllocationResult {
  const now = state.now
  let seq = state.seq

  const products = state.products.map((p) => ({ ...p }))
  const orders = state.orders.map((o) => ({
    ...o,
    lines: o.lines.map((l) => ({ ...l })),
    trail: [...o.trail],
  }))
  const exceptions = state.exceptions.map((e) => ({ ...e }))
  const logs: LogEntry[] = []

  const pById = new Map(products.map((p) => [p.sku, p]))

  // recompute scores against current time
  orders.forEach((o) => (o.score = computeScore(o, now)))

  const queue = orders
    .filter((o) => o.stage === 'created' || o.stage === 'backorder')
    .sort((a, b) => b.score - a.score)

  logs.push({
    id: makeId('log', seq++),
    at: now,
    kind: 'allocation',
    message: `Allocation run started — ${queue.length} open orders ranked by priority score.`,
  })

  for (const order of queue) {
    let anyShort = false
    const shorts: { sku: string; need: number; got: number }[] = []

    for (const line of order.lines) {
      const p = pById.get(line.sku)
      if (!p) continue
      const need = line.qty - line.allocated
      if (need <= 0) continue
      const canGive = available(p)
      const take = Math.min(need, canGive)
      if (take > 0) {
        line.allocated += take
        p.allocated += take
      }
      if (line.allocated < line.qty) {
        anyShort = true
        shorts.push({ sku: line.sku, need: line.qty, got: line.allocated })
      }
    }

    if (!anyShort) {
      order.stage = 'allocated'
      const note = `Fully allocated (score ${order.score}). All ${order.lines.length} line(s) reserved.`
      order.trail.push(note)
      logs.push({
        id: makeId('log', seq++),
        at: now,
        kind: 'allocation',
        message: `${order.id} → fully allocated (score ${order.score}).`,
        emphasis: 'good',
      })
    } else {
      order.stage = 'backorder'
      for (const s of shorts) {
        const p = pById.get(s.sku)!
        const note = `Short on ${s.sku}: reserved ${s.got}/${s.need}. ${
          s.got > 0 ? 'Partial reservation held.' : 'No stock available.'
        }`
        order.trail.push(note)

        // find a lower-priority order currently holding this SKU
        const donor = orders.find(
          (o) =>
            o.id !== order.id &&
            o.score < order.score &&
            o.stage !== 'delivered' &&
            o.lines.some((l) => l.sku === s.sku && l.allocated > 0),
        )

        const opts: ExceptionOption[] = []
        if (s.got > 0) {
          opts.push({
            label: `Partial-ship ${s.got}/${s.need} now`,
            recommended: order.priority === 'urgent',
            detail: `Send available units immediately and backorder the remaining ${
              s.need - s.got
            }. Keeps the ${order.tier} customer's SLA intact.`,
          })
        }
        if (donor) {
          opts.push({
            label: `Reallocate from ${donor.id}`,
            recommended: !s.got && order.priority === 'urgent',
            detail: `${donor.id} (score ${donor.score}) holds units of ${s.sku} at lower priority. Reassign to satisfy the higher-priority order.`,
          })
        }
        opts.push({
          label: `Reorder ${p.reorderQty} units`,
          recommended: p.incoming === 0 && !donor && s.got === 0,
          detail: `Raise a purchase order for ${p.reorderQty} units. ETA depends on supplier lead time.`,
        })
        opts.push({
          label: 'Hold order until restock',
          detail: `Park the order in backorder and revisit after the next inbound receipt.`,
        })

        upsertException(exceptions, {
          id: `exc-${order.id}-${s.sku}`,
          type: s.got === 0 ? 'out-of-stock' : 'low-stock',
          severity: order.priority === 'urgent' ? 'high' : s.got === 0 ? 'high' : 'medium',
          sku: s.sku,
          orderId: order.id,
          title:
            s.got === 0
              ? `${p.name} out of stock for ${order.id}`
              : `${p.name} short for ${order.id}`,
          detail: `${order.id} needs ${s.need} of ${s.sku}; ${s.got} reserved, ${
            s.need - s.got
          } short. Available on hand: ${available(p)}.`,
          createdAt: now,
          resolved: false,
          options: opts,
        })
      }
      logs.push({
        id: makeId('log', seq++),
        at: now,
        kind: 'allocation',
        message: `${order.id} → backorder. ${shorts.length} line(s) short of stock — exception raised.`,
        emphasis: 'warn',
      })
    }
  }

  // reorder / low-stock scan across the catalog
  for (const p of products) {
    if (available(p) <= p.reorderPoint) {
      const already = exceptions.find(
        (e) => e.sku === p.sku && e.type === 'low-stock' && !e.orderId && !e.resolved,
      )
      if (!already && p.incoming === 0) {
        upsertException(exceptions, {
          id: `exc-restock-${p.sku}`,
          type: available(p) === 0 ? 'out-of-stock' : 'low-stock',
          severity: available(p) === 0 ? 'high' : 'medium',
          sku: p.sku,
          title: `${p.name} below reorder point`,
          detail: `Available ${available(p)} ≤ reorder point ${p.reorderPoint}. Recommended reorder: ${p.reorderQty} units.`,
          createdAt: now,
          resolved: false,
          options: [
            {
              label: `Reorder ${p.reorderQty} units`,
              recommended: true,
              detail: `Bring stock back above the reorder point and cover forecast demand.`,
            },
            { label: 'Snooze 24h', detail: 'Defer if a shipment is already expected.' },
          ],
        })
      }
    }
  }

  const allocatedCount = queue.filter((o) => o.stage === 'allocated').length
  const backorderCount = queue.filter((o) => o.stage === 'backorder').length
  logs.push({
    id: makeId('log', seq++),
    at: now,
    kind: 'allocation',
    message: `Allocation complete — ${allocatedCount} allocated, ${backorderCount} backordered.`,
    emphasis: backorderCount > 0 ? 'warn' : 'good',
  })

  return { products, orders, exceptions, logs, seq }
}

function upsertException(list: Exception[], exc: Exception) {
  const idx = list.findIndex((e) => e.id === exc.id)
  if (idx >= 0) {
    if (list[idx].resolved) return // don't reopen a resolved exception
    list[idx] = { ...exc }
  } else {
    list.push(exc)
  }
}

/* --------------------------- picking optimizer --------------------------- */

export interface PickTask {
  sku: string
  name: string
  qty: number
  zone: string
  aisle: number
  bay: number
  orderId: string
}

export interface PickWave {
  zone: string
  tasks: PickTask[]
  units: number
}

/**
 * Build travel-optimized pick waves. Groups tasks by zone, then sequences each
 * zone by aisle → bay so a picker walks a single serpentine route instead of
 * criss-crossing the floor.
 */
export function buildPickWaves(orders: Order[], products: Product[]): PickWave[] {
  const pById = new Map(products.map((p) => [p.sku, p]))
  const byZone = new Map<string, PickTask[]>()

  for (const o of orders) {
    if (o.stage !== 'picking') continue
    for (const l of o.lines) {
      const remaining = l.allocated - l.picked
      if (remaining <= 0) continue
      const p = pById.get(l.sku)
      if (!p) continue
      const task: PickTask = {
        sku: l.sku,
        name: p.name,
        qty: remaining,
        zone: p.zone,
        aisle: p.aisle,
        bay: p.bay,
        orderId: o.id,
      }
      const arr = byZone.get(p.zone) ?? []
      arr.push(task)
      byZone.set(p.zone, arr)
    }
  }

  const waves: PickWave[] = []
  for (const [zone, tasks] of byZone) {
    tasks.sort((a, b) => a.aisle - b.aisle || a.bay - b.bay)
    waves.push({ zone, tasks, units: tasks.reduce((s, t) => s + t.qty, 0) })
  }
  waves.sort((a, b) => a.zone.localeCompare(b.zone))
  return waves
}

/* ------------------------- reorder recommendations ------------------------ */

export interface ReorderRec {
  sku: string
  name: string
  available: number
  reorderPoint: number
  recommendedQty: number
  incoming: number
  reason: string
}

export function reorderRecommendations(
  products: Product[],
  orders: Order[],
): ReorderRec[] {
  // open demand per sku (unallocated need)
  const demand = new Map<string, number>()
  for (const o of orders) {
    if (o.stage === 'delivered') continue
    for (const l of o.lines) {
      const need = l.qty - l.allocated
      if (need > 0) demand.set(l.sku, (demand.get(l.sku) ?? 0) + need)
    }
  }

  const recs: ReorderRec[] = []
  for (const p of products) {
    const avail = available(p)
    const openDemand = demand.get(p.sku) ?? 0
    const belowPoint = avail <= p.reorderPoint
    if (!belowPoint && openDemand === 0) continue
    const shortfall = Math.max(0, openDemand - avail)
    const recommendedQty = Math.max(p.reorderQty, shortfall)
    let reason: string
    if (avail === 0) reason = 'Out of stock'
    else if (shortfall > 0) reason = `Open demand exceeds stock by ${shortfall}`
    else reason = 'At/below reorder point'
    recs.push({
      sku: p.sku,
      name: p.name,
      available: avail,
      reorderPoint: p.reorderPoint,
      recommendedQty,
      incoming: p.incoming,
      reason,
    })
  }
  recs.sort((a, b) => a.available - b.available)
  return recs
}

/* ------------------------------ next stage ------------------------------- */

export const STAGE_FLOW: Record<string, Order['stage'] | null> = {
  allocated: 'picking',
  picking: 'packing',
  packing: 'qc',
  qc: 'dispatch',
  dispatch: 'delivered',
  delivered: null,
  created: null,
  backorder: null,
}

export const STAGE_LABEL: Record<Order['stage'], string> = {
  created: 'Created',
  allocated: 'Allocated',
  picking: 'Picking',
  packing: 'Packing',
  qc: 'Quality Check',
  dispatch: 'Dispatch',
  delivered: 'Delivered',
  backorder: 'Backorder',
}
