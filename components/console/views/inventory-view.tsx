'use client'

import { useMemo, useState } from 'react'
import { PackagePlus, ShieldAlert } from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, StatCard, Meter, Pill } from '@/components/console/primitives'
import { ZonePill } from '@/components/console/shared'
import { available } from '@/lib/engine'
import { currency, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Zone } from '@/lib/types'

const ZONES: (Zone | 'ALL')[] = ['ALL', 'A', 'B', 'C', 'D', 'COLD']

export function InventoryView() {
  const { state, reorder, reportDamage } = useWarehouse()
  const { products } = state
  const [zone, setZone] = useState<Zone | 'ALL'>('ALL')

  const filtered = useMemo(
    () => products.filter((p) => zone === 'ALL' || p.zone === zone),
    [products, zone],
  )

  const outOfStock = products.filter((p) => available(p) === 0).length
  const lowStock = products.filter((p) => available(p) > 0 && available(p) <= p.reorderPoint).length
  const incoming = products.reduce((s, p) => s + p.incoming, 0)
  const invValue = products.reduce((s, p) => s + p.onHand * p.unitPrice, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Out of stock" value={num(outOfStock)} tone={outOfStock ? 'danger' : 'success'} hint="zero available" />
        <StatCard label="Low stock" value={num(lowStock)} tone={lowStock ? 'warning' : 'success'} hint="at/below reorder point" />
        <StatCard label="Units inbound" value={num(incoming)} tone="info" hint="on purchase orders" />
        <StatCard label="Inventory value" value={currency(invValue)} hint="on-hand at cost" />
      </div>

      <Panel
        title="Stock ledger"
        subtitle="Live on-hand, reservations, and reorder posture per SKU"
        action={
          <div className="flex items-center gap-1">
            {ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  zone === z ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {z === 'ALL' ? 'All' : z}
              </button>
            ))}
          </div>
        }
      >
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">SKU / Product</th>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                <th className="px-3 py-2.5 text-right font-medium">Reserved</th>
                <th className="px-3 py-2.5 text-right font-medium">Available</th>
                <th className="px-3 py-2.5 font-medium">Stock vs. reorder</th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((p) => {
                const avail = available(p)
                const status = avail === 0 ? 'out' : avail <= p.reorderPoint ? 'low' : 'ok'
                const meterMax = Math.max(p.reorderPoint * 2, p.onHand, 1)
                return (
                  <tr key={p.sku} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                        {status === 'out' && <Pill tone="danger">Out</Pill>}
                        {status === 'low' && <Pill tone="warning">Low</Pill>}
                      </div>
                      <div className="mt-0.5 font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.category} · {currency(p.unitPrice)}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <ZonePill zone={p.zone} />
                        <span className="font-mono text-[11px] text-muted-foreground">A{p.aisle}·B{p.bay}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{num(p.onHand)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">{num(p.allocated)}</td>
                    <td className={cn('px-3 py-3 text-right font-mono font-semibold tabular-nums', status === 'out' ? 'text-destructive' : status === 'low' ? 'text-warning' : 'text-foreground')}>
                      {num(avail)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-40">
                        <Meter value={avail} max={meterMax} tone={status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'success'} />
                        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                          <span>ROP {p.reorderPoint}</span>
                          {p.incoming > 0 ? <span className="text-info">+{p.incoming} inbound</span> : <span>Qty {p.reorderQty}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => reorder(p.sku)}
                          className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
                          title={`Reorder ${p.reorderQty} units`}
                        >
                          <PackagePlus className="h-3.5 w-3.5" /> Reorder
                        </button>
                        <button
                          onClick={() => reportDamage(p.sku, Math.min(3, p.onHand))}
                          disabled={p.onHand === 0}
                          className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
                          title="Report damaged units"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" /> Damage
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
