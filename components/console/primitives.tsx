import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/* -------------------------------- Panel --------------------------------- */

export function Panel({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card/60 backdrop-blur-sm',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground/70">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/* --------------------------------- Pill --------------------------------- */

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const toneMap: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-primary/15 text-primary border-primary/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-destructive/15 text-destructive border-destructive/30',
  info: 'bg-info/15 text-info border-info/30',
}

export function Pill({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        toneMap[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotMap[tone])} />}
      {children}
    </span>
  )
}

const dotMap: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
}

/* -------------------------------- StatCard ------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  icon?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon && <span className={cn('text-muted-foreground', tone !== 'neutral' && toneText[tone])}>{icon}</span>}
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

const toneText: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-info',
}

/* ------------------------------ Meter / Bar ----------------------------- */

export function Meter({
  value,
  max,
  tone = 'primary',
  className,
}: {
  value: number
  max: number
  tone?: Tone
  className?: string
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-all', barMap[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

const barMap: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
}
