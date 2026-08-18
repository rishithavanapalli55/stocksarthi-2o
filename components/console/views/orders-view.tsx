'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, ListChecks, Search, X } from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, Meter, Pill } from '@/components/console/primitives'
import { PriorityPill, SlaPill, StageBadge, TierPill } from '@/components/console/shared'
import {
  orderValue,
  scoreBreakdown,
  STAGE_FLOW,
  STAGE_LABEL,
} from '@/lib/engine'
import { currency, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order } from '@/lib/types'

const FILTERS: { id: string; label: string; test: (o: Order) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'open', label: 'Open', test: (o) => !['delivered'].includes(o.stage) },
  { id: 'backorder', label: 'Backorder', test: (o) => o.stage === 'backorder' },
  { id: 'active', label: 'In fulfillment', test: (o) => ['picking', 'packing', 'qc', 'dispatch'].includes(o.stage) },
  { id: 'delivered', label: 'Delivered', test: (o) => o.stage === 'delivered' },
]

export function OrdersView() {
  const { state, advanceOrder, runAllocation } = useWarehouse()
  const { orders, products, now } = state
  const [filter, setFilter] = useState('open')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!
    const q = query.trim().toLowerCase()
    return [...orders]
      .filter(f.test)
      .filter((o) =>
        q === '' ||
        o.id.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.lines.some((l) => l.sku.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.score - a.score)
  }, [orders, filter, query])

  const selected = orders.find((o) => o.id === selectedId) ?? list[0] ?? null

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Panel
        className="lg:col-span-3"
        title="Order book"
        subtitle="Every order ranked by decision-engine score"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Order, customer, SKU"
                aria-label="Search orders"
                className="h-7 w-44 rounded-md border border-border bg-background pl-7 pr-6 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                    filter === f.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="scrollbar-thin max-h-[70vh] overflow-y-auto">
          <ul className="divide-y divide-border/50">
            {list.map((o) => {
              const units = o.lines.reduce((s, l) => s + l.qty, 0)
              const alloc = o.lines.reduce((s, l) => s + l.allocated, 0)
              const isSel = selected?.id === o.id
              return (
                <li key={o.id}>
                  <button
                    onClick={() => setSelectedId(o.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                      isSel ? 'bg-primary/10' : 'hover:bg-muted/30',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-medium">{o.id}</span>
                        <PriorityPill priority={o.priority} />
                        <StageBadge stage={o.stage} label={STAGE_LABEL[o.stage]} />
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{o.customer}</span>
                        <span>·</span>
                        <span className="font-mono">{num(alloc)}/{num(units)} u</span>
                        <span>·</span>
                        <span className="font-mono">{currency(orderValue(o, products))}</span>
                      </div>
                    </div>
                    <div className="flex w-24 flex-col items-end gap-1">
                      <SlaPill order={o} now={now} />
                      <span className="font-mono text-xs font-semibold text-primary">{o.score}</span>
                    </div>
                  </button>
                </li>
              )
            })}
            {list.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">No orders in this view.</li>
            )}
          </ul>
        </div>
      </Panel>

      {/* Detail */}
      <div className="lg:col-span-2">
        {selected ? (
          <OrderDetail
            key={selected.id}
            order={selected}
            products={products}
            now={now}
            onAdvance={() => advanceOrder(selected.id)}
            onAllocate={runAllocation}
          />
        ) : (
          <Panel title="Order detail">
            <div className="p-6 text-sm text-muted-foreground">Select an order to inspect.</div>
          </Panel>
        )}
      </div>
    </div>
  )
}

function OrderDetail({
  order,
  products,
  now,
  onAdvance,
  onAllocate,
}: {
  order: Order
  products: ReturnType<typeof useWarehouse>['state']['products']
  now: number
  onAdvance: () => void
  onAllocate: () => void
}) {
  const breakdown = scoreBreakdown(order, now)
  const total = breakdown.reduce((s, b) => s + b.value, 0)
  const nextStage = STAGE_FLOW[order.stage]
  const canAdvance = Boolean(nextStage)
  const needsAllocation = order.stage === 'created' || order.stage === 'backorder'

  return (
    <Panel
      title="Order detail"
      subtitle={order.id}
      action={
        needsAllocation ? (
          <button onClick={onAllocate} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90">
            Run allocation
          </button>
        ) : canAdvance ? (
          <button onClick={onAdvance} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90">
            Advance to {STAGE_LABEL[nextStage!]} <ArrowRight className="h-3 w-3" />
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityPill priority={order.priority} />
          <TierPill tier={order.tier} />
          <StageBadge stage={order.stage} label={STAGE_LABEL[order.stage]} />
          <SlaPill order={order} now={now} />
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Customer </span>
          <span className="font-medium">{order.customer}</span>
        </div>

        {/* score */}
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Priority score</span>
            <span className="font-mono text-lg font-semibold text-primary">{order.score}</span>
          </div>
          <div className="flex flex-col gap-2">
            {breakdown.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-24 text-xs text-muted-foreground">{b.label}</span>
                <Meter value={b.value} max={total} tone="primary" className="flex-1" />
                <span className="w-8 text-right font-mono text-xs tabular-nums">{b.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* lines */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Line items</div>
          <ul className="flex flex-col gap-2">
            {order.lines.map((l) => {
              const p = products.find((x) => x.sku === l.sku)
              const done = l.allocated >= l.qty
              return (
                <li key={l.sku} className="rounded-md border border-border bg-card p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p?.name ?? l.sku}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>
                    </div>
                    <Pill tone={done ? 'success' : l.allocated > 0 ? 'warning' : 'danger'}>
                      {l.allocated}/{l.qty} alloc
                    </Pill>
                  </div>
                  <Meter value={l.allocated} max={l.qty} tone={done ? 'success' : 'warning'} className="mt-2" />
                  {l.picked > 0 && (
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">{l.picked} picked</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* trail */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" /> Decision trail
          </div>
          {order.trail.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decisions recorded yet. Run allocation to begin.</p>
          ) : (
            <ol className="relative flex flex-col gap-2 border-l border-border pl-4">
              {order.trail.map((t, i) => (
                <li key={i} className="relative text-xs leading-relaxed text-foreground/90">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                  {t}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Panel>
  )
}
