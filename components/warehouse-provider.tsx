'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Exception,
  LogEntry,
  Order,
  Product,
  WarehouseState,
} from '@/lib/types'
import {
  available,
  computeScore,
  runAllocation,
  slaStatus,
  STAGE_FLOW,
} from '@/lib/engine'
import {
  buildInitialState,
  CATALOG_SKUS,
  CUSTOMERS,
} from '@/lib/warehouse-data'

const HOUR = 3_600_000

type Action =
  | { type: 'RUN_ALLOCATION' }
  | { type: 'ADVANCE_ORDER'; id: string }
  | { type: 'ADVANCE_ALL' }
  | { type: 'RESOLVE_EXCEPTION'; id: string; label: string }
  | { type: 'CREATE_ORDER' }
  | { type: 'REPORT_DAMAGE'; sku: string; qty: number }
  | { type: 'REORDER'; sku: string }
  | { type: 'TICK'; deltaMs: number }

function log(state: WarehouseState, entry: Omit<LogEntry, 'id' | 'at'>): { entry: LogEntry; seq: number } {
  const seq = state.seq
  return { entry: { ...entry, id: `log-${seq}`, at: state.now }, seq: seq + 1 }
}

function cloneProducts(p: Product[]): Product[] {
  return p.map((x) => ({ ...x }))
}
function cloneOrders(o: Order[]): Order[] {
  return o.map((x) => ({ ...x, lines: x.lines.map((l) => ({ ...l })), trail: [...x.trail] }))
}
function cloneExceptions(e: Exception[]): Exception[] {
  return e.map((x) => ({ ...x }))
}

function advanceOne(order: Order, products: Product[]): { order: Order; note: string } | null {
  const next = STAGE_FLOW[order.stage]
  if (!next) return null
  const o: Order = { ...order, lines: order.lines.map((l) => ({ ...l })), trail: [...order.trail] }

  if (next === 'packing') {
    // picking complete — mark everything reserved as physically picked
    o.lines = o.lines.map((l) => ({ ...l, picked: l.allocated }))
  }

  if (next === 'delivered') {
    // ship reserved units: consume from on-hand and release the reservation
    for (const l of o.lines) {
      const p = products.find((x) => x.sku === l.sku)
      if (p) {
        p.onHand = Math.max(0, p.onHand - l.allocated)
        p.allocated = Math.max(0, p.allocated - l.allocated)
      }
    }
  }

  o.stage = next
  const note = `Stage → ${next}`
  o.trail.push(note)
  return { order: o, note }
}

function reducer(state: WarehouseState, action: Action): WarehouseState {
  switch (action.type) {
    case 'RUN_ALLOCATION': {
      const res = runAllocation(state)
      return {
        ...state,
        products: res.products,
        orders: res.orders,
        exceptions: res.exceptions,
        log: [...res.logs.reverse(), ...state.log].slice(0, 200),
        seq: res.seq,
      }
    }

    case 'ADVANCE_ORDER': {
      const products = cloneProducts(state.products)
      const orders = cloneOrders(state.orders)
      const idx = orders.findIndex((o) => o.id === action.id)
      if (idx < 0) return state
      const result = advanceOne(orders[idx], products)
      if (!result) return state
      orders[idx] = result.order
      const { entry, seq } = log({ ...state, seq: state.seq }, {
        kind: 'stage',
        message: `${orders[idx].id} advanced to ${result.order.stage}.`,
        emphasis: result.order.stage === 'delivered' ? 'good' : undefined,
      })
      return { ...state, products, orders, log: [entry, ...state.log].slice(0, 200), seq }
    }

    case 'ADVANCE_ALL': {
      const products = cloneProducts(state.products)
      const orders = cloneOrders(state.orders)
      const logs: LogEntry[] = []
      let seq = state.seq
      for (let i = 0; i < orders.length; i++) {
        // advance one step for any order that is in the active pipeline
        if (['allocated', 'picking', 'packing', 'qc', 'dispatch'].includes(orders[i].stage)) {
          const result = advanceOne(orders[i], products)
          if (result) {
            orders[i] = result.order
            logs.push({ id: `log-${seq++}`, at: state.now, kind: 'stage', message: `${orders[i].id} → ${result.order.stage}.` })
          }
        }
      }
      return { ...state, products, orders, log: [...logs.reverse(), ...state.log].slice(0, 200), seq }
    }

    case 'REORDER': {
      const products = cloneProducts(state.products)
      const exceptions = cloneExceptions(state.exceptions)
      const p = products.find((x) => x.sku === action.sku)
      if (!p) return state
      p.incoming += p.reorderQty
      // instantly receive part of it to keep the demo moving
      p.onHand += p.reorderQty
      p.incoming -= p.reorderQty
      exceptions.forEach((e) => {
        if (e.sku === action.sku && !e.resolved) {
          e.resolved = true
          e.resolution = `Reordered ${p.reorderQty} units`
        }
      })
      const { entry, seq } = log(state, {
        kind: 'reorder',
        message: `Reorder received: +${p.reorderQty} ${p.sku}. On hand now ${p.onHand}.`,
        emphasis: 'good',
      })
      return { ...state, products, exceptions, log: [entry, ...state.log].slice(0, 200), seq }
    }

    case 'REPORT_DAMAGE': {
      const products = cloneProducts(state.products)
      const exceptions = cloneExceptions(state.exceptions)
      const p = products.find((x) => x.sku === action.sku)
      if (!p) return state
      const qty = Math.min(action.qty, p.onHand)
      p.onHand = Math.max(0, p.onHand - qty)
      const exc: Exception = {
        id: `exc-dmg-${state.seq}`,
        type: 'damaged',
        severity: 'medium',
        sku: p.sku,
        title: `${qty} unit(s) of ${p.name} reported damaged`,
        detail: `${qty} units removed from ${p.sku} on hand during inspection. On hand now ${p.onHand}.`,
        createdAt: state.now,
        resolved: false,
        options: [
          { label: 'Write off & adjust inventory', recommended: true, detail: 'Permanently remove units and log shrinkage against the SKU.' },
          { label: 'Quarantine for supplier claim', detail: 'Hold units aside and open a supplier credit claim.' },
        ],
      }
      const { entry, seq } = log({ ...state, seq: state.seq + 1 }, {
        kind: 'exception',
        message: `Damage reported: ${qty} × ${p.sku} pulled from stock.`,
        emphasis: 'bad',
      })
      return { ...state, products, exceptions: [exc, ...exceptions], log: [entry, ...state.log].slice(0, 200), seq }
    }

    case 'RESOLVE_EXCEPTION': {
      let products = cloneProducts(state.products)
      let orders = cloneOrders(state.orders)
      const exceptions = cloneExceptions(state.exceptions)
      const exc = exceptions.find((e) => e.id === action.id)
      if (!exc) return state
      const label = action.label
      let logMsg = `${exc.title}: "${label}".`
      let emphasis: LogEntry['emphasis'] = 'good'

      if (label.startsWith('Reorder')) {
        const p = products.find((x) => x.sku === exc.sku)
        if (p) {
          p.onHand += p.reorderQty
          logMsg = `Reorder placed & received for ${p.sku} (+${p.reorderQty}).`
        }
      } else if (label.startsWith('Reallocate')) {
        // pull the SKU from a lower-priority donor and give it to exc.orderId
        const target = orders.find((o) => o.id === exc.orderId)
        const p = products.find((x) => x.sku === exc.sku)
        if (target && p) {
          const line = target.lines.find((l) => l.sku === exc.sku)
          const need = line ? line.qty - line.allocated : 0
          const donor = orders
            .filter((o) => o.id !== target.id && o.score < target.score && o.lines.some((l) => l.sku === exc.sku && l.allocated > 0))
            .sort((a, b) => a.score - b.score)[0]
          if (line && donor && need > 0) {
            const dLine = donor.lines.find((l) => l.sku === exc.sku)!
            const moved = Math.min(dLine.allocated, need)
            dLine.allocated -= moved
            line.allocated += moved
            donor.stage = 'backorder'
            donor.trail.push(`Reallocated ${moved} × ${exc.sku} to higher-priority ${target.id}.`)
            if (target.lines.every((l) => l.allocated >= l.qty)) {
              target.stage = 'allocated'
              target.trail.push(`Fully allocated after reallocation from ${donor.id}.`)
            }
            logMsg = `Reallocated ${moved} × ${exc.sku} from ${donor.id} → ${target.id}.`
          }
        }
      } else if (label.startsWith('Partial-ship')) {
        const target = orders.find((o) => o.id === exc.orderId)
        if (target) {
          target.stage = 'allocated'
          target.trail.push('Approved partial shipment of available units; remainder backordered.')
          logMsg = `${target.id} approved for partial shipment.`
          emphasis = 'warn'
        }
      } else if (label.startsWith('Write off')) {
        logMsg = `${exc.sku} damage written off; inventory adjusted.`
        emphasis = 'warn'
      } else {
        emphasis = 'warn'
      }

      exc.resolved = true
      exc.resolution = label
      const { entry, seq } = log(state, { kind: 'exception', message: logMsg, emphasis })
      return { ...state, products, orders, exceptions, log: [entry, ...state.log].slice(0, 200), seq }
    }

    case 'CREATE_ORDER': {
      const orders = cloneOrders(state.orders)
      const n = 1 + Math.floor(Math.random() * 2)
      const skus = [...CATALOG_SKUS].sort(() => Math.random() - 0.5).slice(0, n)
      const priorities: Order['priority'][] = ['urgent', 'express', 'standard']
      const tiers: Order['tier'][] = ['vip', 'business', 'retail']
      const priority = priorities[Math.floor(Math.random() * priorities.length)]
      const tier = tiers[Math.floor(Math.random() * tiers.length)]
      const slaHours = priority === 'urgent' ? 2 + Math.random() * 2 : priority === 'express' ? 4 + Math.random() * 4 : 20 + Math.random() * 12
      const order: Order = {
        id: `ORD-${9000 + state.seq}`,
        customer: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)],
        tier,
        priority,
        createdAt: state.now,
        slaAt: state.now + slaHours * HOUR,
        stage: 'created',
        score: 0,
        trail: ['Order received.'],
        lines: skus.map((sku) => ({ sku, qty: 1 + Math.floor(Math.random() * 8), allocated: 0, picked: 0 })),
      }
      order.score = computeScore(order, state.now)
      const { entry, seq } = log(state, {
        kind: 'system',
        message: `New ${priority} order ${order.id} from ${order.customer}.`,
      })
      return { ...state, orders: [order, ...orders], log: [entry, ...state.log].slice(0, 200), seq }
    }

    case 'TICK': {
      const now = state.now + action.deltaMs
      const orders = cloneOrders(state.orders)
      const exceptions = cloneExceptions(state.exceptions)
      let seq = state.seq
      const logs: LogEntry[] = []

      // recompute scores against the new time
      orders.forEach((o) => (o.score = computeScore(o, now)))

      // raise SLA-risk exceptions for in-flight critical/overdue orders
      for (const o of orders) {
        if (['delivered', 'created', 'backorder'].includes(o.stage)) continue
        const st = slaStatus(o, now)
        if (st === 'critical' || st === 'overdue') {
          const id = `exc-sla-${o.id}`
          if (!exceptions.find((e) => e.id === id && !e.resolved)) {
            exceptions.unshift({
              id,
              type: 'sla-risk',
              severity: st === 'overdue' ? 'high' : 'medium',
              orderId: o.id,
              title: `${o.id} at SLA risk`,
              detail: `${o.id} is ${st} and still in ${o.stage}. Expedite to protect the ${o.tier} customer.`,
              createdAt: now,
              resolved: false,
              options: [
                { label: 'Expedite pick & pack', recommended: true, detail: 'Bump this order to the front of every downstream queue.' },
                { label: 'Upgrade carrier service', detail: 'Absorb shipping cost to recover the delivery window.' },
              ],
            })
            logs.push({ id: `log-${seq++}`, at: now, kind: 'exception', message: `${o.id} flagged ${st} on SLA.`, emphasis: 'bad' })
          }
        }
      }

      return { ...state, now, orders, exceptions, log: [...logs.reverse(), ...state.log].slice(0, 200), seq }
    }

    default:
      return state
  }
}

interface WarehouseContextValue {
  state: WarehouseState
  runAllocation: () => void
  advanceOrder: (id: string) => void
  advanceAll: () => void
  resolveException: (id: string, label: string) => void
  createOrder: () => void
  reportDamage: (sku: string, qty: number) => void
  reorder: (sku: string) => void
  simulating: boolean
  setSimulating: (v: boolean) => void
}

const WarehouseContext = createContext<WarehouseContextValue | null>(null)

export function WarehouseProvider({ children }: { children: ReactNode }) {
  // fixed seed time so SSR and first client render match; advanced via TICK
  const seedRef = useRef<number>(new Date('2026-08-18T09:12:00').getTime())
  const [state, dispatch] = useReducer(reducer, seedRef.current, buildInitialState)
  const [simulating, setSimulating] = useState(false)

  useEffect(() => {
    if (!simulating) return
    const id = setInterval(() => {
      dispatch({ type: 'TICK', deltaMs: 4 * 60_000 })
      if (Math.random() < 0.4) dispatch({ type: 'ADVANCE_ALL' })
      if (Math.random() < 0.25) dispatch({ type: 'CREATE_ORDER' })
    }, 2500)
    return () => clearInterval(id)
  }, [simulating])

  const value = useMemo<WarehouseContextValue>(
    () => ({
      state,
      runAllocation: () => dispatch({ type: 'RUN_ALLOCATION' }),
      advanceOrder: (id) => dispatch({ type: 'ADVANCE_ORDER', id }),
      advanceAll: () => dispatch({ type: 'ADVANCE_ALL' }),
      resolveException: (id, label) => dispatch({ type: 'RESOLVE_EXCEPTION', id, label }),
      createOrder: () => dispatch({ type: 'CREATE_ORDER' }),
      reportDamage: (sku, qty) => dispatch({ type: 'REPORT_DAMAGE', sku, qty }),
      reorder: (sku) => dispatch({ type: 'REORDER', sku }),
      simulating,
      setSimulating,
    }),
    [state, simulating],
  )

  return <WarehouseContext.Provider value={value}>{children}</WarehouseContext.Provider>
}

export function useWarehouse() {
  const ctx = useContext(WarehouseContext)
  if (!ctx) throw new Error('useWarehouse must be used within WarehouseProvider')
  return ctx
}

export { available, slaStatus }
