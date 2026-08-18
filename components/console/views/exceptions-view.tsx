'use client'

import {
  Ban,
  CircleCheck,
  Clock,
  PackageX,
  ShieldAlert,
  TrendingDown,
} from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, StatCard, Pill } from '@/components/console/primitives'
import { SeverityPill } from '@/components/console/shared'
import { reorderRecommendations } from '@/lib/engine'
import { num, relTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Exception, ExceptionType } from '@/lib/types'

const typeMeta: Record<ExceptionType, { icon: typeof Ban; label: string }> = {
  'out-of-stock': { icon: PackageX, label: 'Out of stock' },
  'low-stock': { icon: TrendingDown, label: 'Low stock' },
  damaged: { icon: ShieldAlert, label: 'Damaged' },
  missing: { icon: Ban, label: 'Missing' },
  'sla-risk': { icon: Clock, label: 'SLA risk' },
}

export function ExceptionsView() {
  const { state, resolveException, reorder } = useWarehouse()
  const { exceptions, orders, products } = state

  const open = exceptions.filter((e) => !e.resolved)
  const resolved = exceptions.filter((e) => e.resolved)
  const high = open.filter((e) => e.severity === 'high').length

  const recs = reorderRecommendations(products, orders)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Open exceptions" value={num(open.length)} tone={open.length ? 'danger' : 'success'} />
        <StatCard label="High severity" value={num(high)} tone={high ? 'danger' : 'success'} />
        <StatCard label="Resolved" value={num(resolved.length)} tone="success" />
        <StatCard label="Reorder recs" value={num(recs.length)} tone={recs.length ? 'warning' : 'success'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel className="lg:col-span-3" title="Exception queue" subtitle="Exception → Decision → Resolution">
          {open.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <CircleCheck className="h-5 w-5 text-success" /> No open exceptions. The floor is clear.
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {open.map((e) => (
                <ExceptionRow key={e.id} exc={e} onResolve={(label) => resolveException(e.id, label)} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Reorder recommendations" subtitle="Ranked by stock risk vs. open demand">
          {recs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Stock levels are healthy across all SKUs.</div>
          ) : (
            <ul className="divide-y divide-border/50">
              {recs.map((r) => (
                <li key={r.sku} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      {r.available === 0 && <Pill tone="danger">Out</Pill>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {r.reason} · avail {r.available} / ROP {r.reorderPoint}
                      {r.incoming > 0 && <span className="text-info"> · +{r.incoming} inbound</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => reorder(r.sku)}
                    className="shrink-0 rounded-md bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/25"
                  >
                    +{r.recommendedQty}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {resolved.length > 0 && (
        <Panel title="Resolution log" subtitle="Recently closed exceptions and the decision taken">
          <ul className="divide-y divide-border/40">
            {resolved.slice(0, 12).map((e) => {
              const Meta = typeMeta[e.type]
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Meta.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">{e.title}</span>
                  <Pill tone="success" dot>{e.resolution ?? 'Resolved'}</Pill>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function ExceptionRow({ exc, onResolve }: { exc: Exception; onResolve: (label: string) => void }) {
  const Meta = typeMeta[exc.type]
  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
            exc.severity === 'high' ? 'bg-destructive/15 text-destructive' : exc.severity === 'medium' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
          )}
        >
          <Meta.icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{exc.title}</span>
            <SeverityPill severity={exc.severity} />
            <Pill tone="neutral">{Meta.label}</Pill>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{exc.detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-11">
        {exc.options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onResolve(opt.label)}
            title={opt.detail}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
              opt.recommended
                ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {opt.recommended && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            {opt.label}
          </button>
        ))}
      </div>
    </li>
  )
}
