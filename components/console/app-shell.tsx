'use client'

import { useState } from 'react'
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Pause,
  Play,
  Plus,
  Radio,
  TriangleAlert,
  Truck,
  Warehouse,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWarehouse } from '@/components/warehouse-provider'
import { clockTime } from '@/lib/format'
import { Pill } from '@/components/console/primitives'
import { DashboardView } from '@/components/console/views/dashboard-view'
import { InventoryView } from '@/components/console/views/inventory-view'
import { OrdersView } from '@/components/console/views/orders-view'
import { FulfillmentView } from '@/components/console/views/fulfillment-view'
import { ExceptionsView } from '@/components/console/views/exceptions-view'
import { AnalyticsView } from '@/components/console/views/analytics-view'

type ViewId = 'dashboard' | 'inventory' | 'orders' | 'fulfillment' | 'exceptions' | 'analytics'

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Command', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'fulfillment', label: 'Fulfillment', icon: Truck },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'exceptions', label: 'Exceptions', icon: TriangleAlert },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
]

export function AppShell() {
  const [view, setView] = useState<ViewId>('dashboard')
  const { state, runAllocation, createOrder, simulating, setSimulating } = useWarehouse()

  const openExceptions = state.exceptions.filter((e) => !e.resolved).length
  const backorders = state.orders.filter((o) => o.stage === 'backorder').length

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Warehouse className="h-4.5 w-4.5" strokeWidth={2.2} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">StockSarthi</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ops Console</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            const badge =
              item.id === 'exceptions' ? openExceptions : item.id === 'orders' ? backorders : 0
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
                <span className="flex-1 text-left">{item.label}</span>
                {badge > 0 && (
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold',
                      item.id === 'exceptions'
                        ? 'bg-destructive/20 text-destructive'
                        : 'bg-warning/20 text-warning',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Radio className="h-3.5 w-3.5 text-success" />
              Zone health
            </div>
            <p className="leading-relaxed">
              5 zones online · {state.products.length} SKUs tracked · decision engine v1.
            </p>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Command bar */}
        <header className="flex items-center gap-3 border-b border-border bg-card/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums">{clockTime(state.now)}</span>
            <Pill tone={simulating ? 'success' : 'neutral'} dot>
              {simulating ? 'LIVE' : 'PAUSED'}
            </Pill>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={createOrder}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              New order
            </button>
            <button
              onClick={runAllocation}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={2.4} />
              Run allocation
            </button>
            <button
              onClick={() => setSimulating(!simulating)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                simulating
                  ? 'border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25'
                  : 'border-success/40 bg-success/15 text-success hover:bg-success/25',
              )}
            >
              {simulating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {simulating ? 'Pause sim' : 'Run sim'}
            </button>
          </div>
        </header>

        {/* View */}
        <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
          {view === 'dashboard' && <DashboardView onNavigate={setView} />}
          {view === 'orders' && <OrdersView />}
          {view === 'fulfillment' && <FulfillmentView />}
          {view === 'inventory' && <InventoryView />}
          {view === 'exceptions' && <ExceptionsView />}
          {view === 'analytics' && <AnalyticsView />}
        </main>
      </div>
    </div>
  )
}

export type { ViewId }
