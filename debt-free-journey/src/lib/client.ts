'use client'

import { useCallback, useEffect, useState } from 'react'

/** Tiny fetch hook: GETs a JSON endpoint, exposes reload(). */
export function useApi<T>(url: string): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Request failed (${r.status})`)
        return r.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading, error, reload }
}

export async function apiSend(url: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`)
  return json
}

export function monthLabel(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function dateLabel(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}
