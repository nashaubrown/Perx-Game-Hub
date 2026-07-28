// All money is stored and computed in integer minor units (e.g. laari for MVR)
// to avoid floating-point drift. Convert at the UI boundary only.

export function toMinor(major: number | string): number {
  const n = typeof major === 'string' ? parseFloat(major.replace(/,/g, '')) : major
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}

export function toMajor(minor: number): number {
  return minor / 100
}

export function formatMoney(minor: number, currency = 'MVR', opts?: { sign?: boolean }): string {
  const sign = minor < 0 ? '-' : opts?.sign ? '+' : ''
  const abs = Math.abs(minor)
  const major = Math.floor(abs / 100)
  const cents = abs % 100
  const grouped = major.toLocaleString('en-US')
  return `${sign}${currency} ${grouped}.${cents.toString().padStart(2, '0')}`
}

export function formatMoneyShort(minor: number, currency = 'MVR'): string {
  const major = minor / 100
  if (Math.abs(major) >= 1_000_000) return `${currency} ${(major / 1_000_000).toFixed(1)}M`
  if (Math.abs(major) >= 10_000) return `${currency} ${(major / 1000).toFixed(0)}k`
  return formatMoney(minor, currency)
}

// Round-half-up on a positive product of balance * rate, in minor units.
export function accrue(balanceMinor: number, monthlyRate: number): number {
  return Math.round(balanceMinor * monthlyRate)
}
