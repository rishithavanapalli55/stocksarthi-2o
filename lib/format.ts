export function currency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export function currencyPrecise(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function num(n: number): string {
  return n.toLocaleString('en-US')
}

/** compact relative-time, e.g. "2h 14m", "-45m" (overdue) */
export function relTime(ms: number): string {
  const past = ms < 0
  const abs = Math.abs(ms)
  const h = Math.floor(abs / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const core = h > 0 ? `${h}h ${m}m` : `${m}m`
  return past ? `${core} ago` : core
}

export function slaCountdown(ms: number): string {
  if (ms < 0) return `${relTime(ms)}`
  return `in ${relTime(ms)}`
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
