'use client'

import {
  Activity,
  ArrowRight,
  Boxes,
  CircleCheck,
  ClipboardList,
  DollarSign,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, StatCard, Meter, Pill } from '@/components/console/primitives'
import { PriorityPill, SlaPill, StageBadge, TierPill } from '@/components/console/shared'
import {
  available,
  orderValue,
  scoreBreakdown,
  slaStatus,
  STAGE_LABEL,
} from '@/lib/engine'
import { currency, num, relTime } from '@/lib/format'
import type { ViewId } from '@/components/console/app-shell'
import { cn } from '@/lib/utils'

export function DashboardView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const { state, resolveException } = useWarehouse()
  const { orders, products, exceptions, log, now } = state

  const active = orders.filter((o) => o.stage !== 'delivered')
  const backorders = orders.filter((o) => o.stage === 'backorder')
  const openExc = exceptions.filter((e) => !e.resolved)
  const slaRisk = active.filter(
    (o) => !['created', 'backorder'].includes(o.stage) && ['critical', 'overdue'].includes(slaStatus(o, now)),
  )

  const demanded = active.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.qty, 0), 0)
  const reserved = active.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.allocated, 0), 0)
  const fillRate = demanded === 0 ? 100 : Math.round((reserved / demanded) * 100)
  const invValue = products.reduce((s, p) => s + p.onHand * p.unitPrice, 0)

  // decision spotlight: the most urgent unresolved order-linked stock conflict
  const spotlight = openExc
    .filter((e) => e.orderId && (e.type === 'out-of-stock' || e.type === 'low-stock'))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))[0]
  const spotlightOrder = spotlight ? orders.find((o) => o.id === spotlight.orderId) : undefined

  // priority queue — orders competing for stock/labor
  const queue = [...orders]
    .filter((o) => !['delivered'].includes(o.stage))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)

  const lowStock = products.filter((p) => available(p) <= p.reorderPoint).length

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open orders" value={num(active.length)} hint={`${orders.length - active.length} delivered`} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="Fill rate" value={`${fillRate}%`} hint={`${num(reserved)}/${num(demanded)} units reserved`} tone={fillRate >= 90 ? 'success' : fillRate >= 70 ? 'warning' : 'danger'} icon={<CircleCheck className="h-4 w-4" />} />
        <StatCard label="Backorders" value={num(backorders.length)} hint="awaiting stock" tone={backorders.length ? 'warning' : 'neutral'} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="SLA at risk" value={num(slaRisk.length)} hint="critical / overdue" tone={slaRisk.length ? 'danger' : 'success'} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Open exceptions" value={num(openExc.length)} hint={`${lowStock} SKUs low`} tone={openExc.length ? 'danger' : 'success'} icon={<TriangleAlert className="h-4 w-4" />} />
        <StatCard label="Inventory value" value={currency(invValue)} hint={`${products.length} SKUs on hand`} icon={<DollarSign className="h-4 w-4" />} />
      </div>

      {/* Decision spotlight */}
      <Panel
        title={
          <span className="flex items-center gap-1.5 text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Decision spotlight
          </span>
        }
        subtitle="The engine surfaces the highest-stakes call on the floor right now"
      >
        {spotlight && spotlightOrder ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">{spotlightOrder.id}</span>
              <PriorityPill priority={spotlightOrder.priority} />
              <TierPill tier={spotlightOrder.tier} />
              <SlaPill order={spotlightOrder} now={now} />
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                score {spotlightOrder.score}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/90">{spotlight.detail}</p>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {spotlight.options.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => resolveException(spotlight.id, opt.label)}
                  className={cn(
                    'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                    opt.recommended
                      ? 'border-primary/50 bg-primary/10 hover:bg-primary/20'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {opt.recommended && <Pill tone="primary">Recommended</Pill>}
                    {opt.label}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{opt.detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <CircleCheck className="h-5 w-5 text-success" />
            No open stock conflicts. Run allocation or start the simulation to generate live decisions.
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Priority queue */}
        <Panel
          className="lg:col-span-3"
          title="Priority queue"
          subtitle="Orders ranked by the decision engine's composite score"
          action={
            <button onClick={() => onNavigate('orders')} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              All orders <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          <ul className="divide-y divide-border/60">
            {queue.map((o, i) => {
              const top = scoreBreakdown(o, now)
              const maxComp = Math.max(...top.map((t) => t.value))
              return (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{o.id}</span>
                      <PriorityPill priority={o.priority} />
                      <StageBadge stage={o.stage} label={STAGE_LABEL[o.stage]} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {o.customer} · {currency(orderValue(o, products))}
                    </div>
                  </div>
                  <div className="hidden w-28 flex-col items-end gap-1 sm:flex">
                    <SlaPill order={o} now={now} />
                    <Meter value={top[1].value} max={maxComp} tone="danger" className="w-24" />
                  </div>
                  <span className="w-12 text-right font-mono text-sm font-semibold tabular-nums text-primary">
                    {o.score}
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>

        {/* Live activity */}
        <Panel className="lg:col-span-2" title="Live activity" subtitle="Decision & workflow event stream">
          <ul className="scrollbar-thin max-h-[360px] divide-y divide-border/50 overflow-y-auto">
            {log.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <span
                  className={cn(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    e.emphasis === 'good'
                      ? 'bg-success'
                      : e.emphasis === 'warn'
                        ? 'bg-warning'
                        : e.emphasis === 'bad'
                          ? 'bg-destructive'
                          : 'bg-muted-foreground',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-foreground/90">{e.message}</p>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {e.kind} · {relTime(e.at - now) === '0m' ? 'now' : relTime(e.at - now)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
