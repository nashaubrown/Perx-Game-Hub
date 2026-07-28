import { createHash } from 'crypto'

/** Uppercase, collapse whitespace, strip punctuation noise — used for
 *  fingerprints and description matching so cosmetic differences between
 *  statement exports don't defeat dedupe. */
export function normalizeDescription(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Dedupe fingerprint: date + amount + normalized description. Re-uploading
 *  the same or an overlapping statement produces identical fingerprints. */
export function fingerprint(dateIso: string, amountMinor: number, description: string): string {
  return createHash('sha256')
    .update(`${dateIso}|${amountMinor}|${normalizeDescription(description)}`)
    .digest('hex')
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

/** Parse the date formats seen on Maldivian bank statements into yyyy-mm-dd.
 *  Returns null when the string is not a recognizable date. */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim()
  // yyyy-mm-dd / yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return isoOrNull(+m[1], +m[2], +m[3])
  // dd/mm/yyyy or dd-mm-yyyy (BML convention: day first)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) return isoOrNull(+m[3], +m[2], +m[1])
  // dd/mm/yy
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/)
  if (m) return isoOrNull(2000 + +m[3], +m[2], +m[1])
  // 01 Jan 2026 / 01-Jan-2026 / 1 JAN 26
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{2,4})$/)
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toUpperCase()]
    if (!mon) return null
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return isoOrNull(year, mon, +m[1])
  }
  return null
}

function isoOrNull(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse a money string like "1,234.56", "(1,234.56)", "1234.56 CR", "-500"
 *  into signed minor units. Returns null when not a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (/(^-)|(-$)/.test(s)) sign *= -1
  const suffix = s.match(/\b(CR|DR)\b/i)?.[1]?.toUpperCase() ?? null
  s = s.replace(/\b(CR|DR)\b/gi, '').replace(/[^0-9.]/g, '')
  if (!s || !/^\d*\.?\d*$/.test(s) || s === '.') return null
  const value = Math.round(parseFloat(s) * 100)
  if (!isFinite(value)) return null
  if (suffix === 'DR') sign = -1
  return sign * value
}
