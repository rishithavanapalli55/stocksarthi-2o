import type { Order, OrderStage, Severity } from '@/lib/types'
import { slaStatus, type SlaStatus } from '@/lib/engine'
import { Pill } from '@/components/console/primitives'
import { slaCountdown } from '@/lib/format'

export function PriorityPill({ priority }: { priority: Order['priority'] }) {
  const tone = priority === 'urgent' ? 'danger' : priority === 'express' ? 'warning' : 'neutral'
  return (
    <Pill tone={tone} className="uppercase tracking-wide">
      {priority}
    </Pill>
  )
}

export function TierPill({ tier }: { tier: Order['tier'] }) {
  const tone = tier === 'vip' ? 'primary' : tier === 'business' ? 'info' : 'neutral'
  const label = tier === 'vip' ? 'VIP' : tier
  return (
    <Pill tone={tone} className="capitalize">
      {label}
    </Pill>
  )
}

const slaTone: Record<SlaStatus, 'danger' | 'warning' | 'info' | 'success'> = {
  overdue: 'danger',
  critical: 'danger',
  soon: 'warning',
  ok: 'success',
}

export function SlaPill({ order, now }: { order: Order; now: number }) {
  const st = slaStatus(order, now)
  return (
    <Pill tone={slaTone[st]} dot>
      {slaCountdown(order.slaAt - now)}
    </Pill>
  )
}

const stageTone: Record<OrderStage, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  created: 'neutral',
  allocated: 'info',
  picking: 'primary',
  packing: 'primary',
  qc: 'warning',
  dispatch: 'info',
  delivered: 'success',
  backorder: 'danger',
}

export function StageBadge({ stage, label }: { stage: OrderStage; label: string }) {
  return <Pill tone={stageTone[stage]}>{label}</Pill>
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const tone = severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'neutral'
  return (
    <Pill tone={tone} className="uppercase tracking-wide">
      {severity}
    </Pill>
  )
}

const zoneTones: Record<string, 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  A: 'primary',
  B: 'info',
  C: 'success',
  D: 'warning',
  COLD: 'neutral',
}

export function ZonePill({ zone }: { zone: string }) {
  return <Pill tone={zoneTones[zone] ?? 'neutral'}>Zone {zone}</Pill>
}
