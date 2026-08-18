'use client'

import { ArrowRight, MapPin, Route } from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, Pill } from '@/components/console/primitives'
import { PriorityPill, SlaPill, ZonePill } from '@/components/console/shared'
import { buildPickWaves, STAGE_FLOW, STAGE_LABEL } from '@/lib/engine'
import { num } from '@/lib/format'
import type { Order, OrderStage } from '@/lib/types'

const COLUMNS: OrderStage[] = ['allocated', 'picking', 'packing', 'qc', 'dispatch', 'delivered']

export function FulfillmentView() {
  const { state, advanceOrder, advanceAll } = useWarehouse()
  const { orders, products, now } = state

  const byStage = (s: OrderStage) =>
    orders.filter((o) => o.stage === s).sort((a, b) => b.score - a.score)

  const waves = buildPickWaves(orders, products)

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Fulfillment pipeline"
        subtitle="Order Created → Allocated → Picking → Packing → QC → Dispatch → Delivered"
        action={
          <button
            onClick={advanceAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            Advance all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        <div className="scrollbar-thin overflow-x-auto p-4">
          <div className="grid min-w-[980px] grid-cols-6 gap-3">
            {COLUMNS.map((stage) => {
              const items = byStage(stage)
              return (
                <div key={stage} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="flex min-h-[120px] flex-col gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-2">
                    {items.map((o) => (
                      <PipelineCard key={o.id} order={o} now={now} onAdvance={() => advanceOrder(o.id)} />
                    ))}
                    {items.length === 0 && (
                      <div className="flex flex-1 items-center justify-center py-4 text-[11px] text-muted-foreground/60">
                        empty
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Panel>

      {/* Pick optimizer */}
      <Panel
        title={
          <span className="flex items-center gap-1.5">
            <Route className="h-3.5 w-3.5 text-primary" /> Optimized pick waves
          </span>
        }
        subtitle="Tasks for orders in Picking, batched by zone and sequenced aisle → bay to minimize travel"
      >
        {waves.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No orders in picking. Advance allocated orders into the Picking stage to generate pick waves.
          </div>
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {waves.map((w) => (
              <div key={w.zone} className="rounded-md border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <ZonePill zone={w.zone} />
                  <span className="font-mono text-[11px] text-muted-foreground">{num(w.units)} units · {w.tasks.length} stops</span>
                </div>
                <ol className="divide-y divide-border/40">
                  {w.tasks.map((t, i) => (
                    <li key={`${t.orderId}-${t.sku}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/15 font-mono text-[10px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{t.name}</div>
                        <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" /> A{t.aisle}·B{t.bay} · {t.orderId}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-semibold text-primary">×{t.qty}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function PipelineCard({ order, now, onAdvance }: { order: Order; now: number; onAdvance: () => void }) {
  const next = STAGE_FLOW[order.stage]
  const units = order.lines.reduce((s, l) => s + l.qty, 0)
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-xs font-semibold">{order.id}</span>
        <PriorityPill priority={order.priority} />
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{order.customer}</div>
      <div className="mt-2 flex items-center justify-between">
        <SlaPill order={order} now={now} />
        <span className="font-mono text-[10px] text-muted-foreground">{num(units)} u</span>
      </div>
      {next && (
        <button
          onClick={onAdvance}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-primary/10 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
        >
          → {STAGE_LABEL[next]}
        </button>
      )}
    </div>
  )
}
