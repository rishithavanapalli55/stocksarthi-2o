'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Gauge } from 'lucide-react'
import { useWarehouse } from '@/components/warehouse-provider'
import { Panel, StatCard } from '@/components/console/primitives'
import { available, orderValue, STAGE_LABEL } from '@/lib/engine'
import { currency, num } from '@/lib/format'
import type { OrderStage } from '@/lib/types'

const AXIS = { fill: 'var(--muted-foreground)', fontSize: 11 }

function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize">{p.name}:</span>
          <span className="font-mono text-foreground">{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsView() {
  const { state } = useWarehouse()
  const { orders, products } = state

  const stageData = useMemo(() => {
    const stages: OrderStage[] = ['created', 'backorder', 'allocated', 'picking', 'packing', 'qc', 'dispatch', 'delivered']
    return stages.map((s) => ({ stage: STAGE_LABEL[s], key: s, count: orders.filter((o) => o.stage === s).length }))
  }, [orders])

  const zoneData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of products) map.set(p.zone, (map.get(p.zone) ?? 0) + p.onHand * p.unitPrice)
    return [...map.entries()].map(([zone, value]) => ({ zone: `Zone ${zone}`, value: Math.round(value) }))
  }, [products])

  const priorityData = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) {
      if (o.stage === 'delivered') continue
      map.set(o.priority, (map.get(o.priority) ?? 0) + orderValue(o, products))
    }
    const order = ['urgent', 'express', 'standard']
    return order.filter((k) => map.has(k)).map((k) => ({ name: k, value: Math.round(map.get(k) ?? 0) }))
  }, [orders, products])

  const demandData = useMemo(() => {
    const map = new Map<string, { demanded: number; reserved: number }>()
    for (const o of orders) {
      if (o.stage === 'delivered') continue
      for (const l of o.lines) {
        const p = products.find((x) => x.sku === l.sku)
        const cat = p?.category ?? 'Other'
        const cur = map.get(cat) ?? { demanded: 0, reserved: 0 }
        cur.demanded += l.qty
        cur.reserved += l.allocated
        map.set(cat, cur)
      }
    }
    return [...map.entries()].map(([category, v]) => ({ category, ...v }))
  }, [orders, products])

  // bottleneck: stage with the most work-in-progress
  const wip = stageData.filter((s) => ['allocated', 'picking', 'packing', 'qc', 'dispatch'].includes(s.key))
  const bottleneck = wip.reduce((max, s) => (s.count > max.count ? s : max), { stage: '—', count: 0, key: '' as OrderStage })
  const backorders = orders.filter((o) => o.stage === 'backorder').length

  const PIE_COLORS = ['var(--chart-4)', 'var(--chart-1)', 'var(--chart-5)']

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Primary bottleneck"
          value={bottleneck.count > 0 ? bottleneck.stage : 'None'}
          tone={bottleneck.count >= 3 ? 'danger' : bottleneck.count > 0 ? 'warning' : 'success'}
          hint={`${bottleneck.count} orders in stage`}
          icon={<Gauge className="h-4 w-4" />}
        />
        <StatCard label="Backordered" value={num(backorders)} tone={backorders ? 'warning' : 'success'} hint="stalled on stock" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Delivered" value={num(orders.filter((o) => o.stage === 'delivered').length)} tone="success" hint="completed orders" />
        <StatCard label="Avg order value" value={currency(orders.reduce((s, o) => s + orderValue(o, products), 0) / Math.max(1, orders.length))} hint="across order book" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Pipeline distribution" subtitle="Orders per workflow stage (bottleneck detection)">
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="stage" tick={AXIS} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ChartTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageData.map((s) => (
                    <Cell key={s.key} fill={s.key === bottleneck.key && bottleneck.count > 0 ? 'var(--chart-4)' : s.key === 'delivered' ? 'var(--chart-3)' : 'var(--chart-1)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Demand vs. reserved" subtitle="Unit coverage by category — gaps signal allocation shortfalls">
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={demandData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="category" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="demanded" name="Demanded" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reserved" name="Reserved" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Inventory value by zone" subtitle="On-hand stock at cost">
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneData} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="zone" tick={AXIS} axisLine={false} tickLine={false} width={60} />
                <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ChartTooltip fmt={(v: number) => currency(v)} />} />
                <Bar dataKey="value" name="Value" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Open order value by priority" subtitle="Where revenue is concentrated in the queue">
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--card)" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip fmt={(v: number) => currency(v)} />} />
                <Legend wrapperStyle={{ fontSize: 11, textTransform: 'capitalize' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  )
}
