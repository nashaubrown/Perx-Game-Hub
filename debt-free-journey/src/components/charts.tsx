'use client'

import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '@/lib/money'

/** Resolve chart series colors from the active theme's CSS variables. */
export function useChartColors(): string[] {
  const [colors, setColors] = useState<string[]>([
    'rgb(13 110 253)',
    'rgb(99 102 241)',
    'rgb(16 158 91)',
    'rgb(217 119 6)',
    'rgb(219 39 119)',
    'rgb(8 145 178)',
  ])
  useEffect(() => {
    const style = getComputedStyle(document.documentElement)
    const resolved = [1, 2, 3, 4, 5, 6].map((i) => {
      const v = style.getPropertyValue(`--chart-${i}`).trim()
      return v ? `rgb(${v})` : 'rgb(99 102 241)'
    })
    setColors(resolved)
  }, [])
  return colors
}

function moneyTick(currency: string) {
  return (v: number) => {
    const major = v / 100
    if (Math.abs(major) >= 1000) return `${Math.round(major / 1000)}k`
    return `${Math.round(major)}`
  }
}

/** Stacked area chart of projected per-debt balances over time, with an
 *  optional "actual" total-balance line overlaid from logged payments. */
export function ProjectionChart({
  data,
  seriesNames,
  currency,
  actualSeries,
}: {
  data: Array<Record<string, number | string>>
  seriesNames: string[]
  currency: string
  actualSeries?: Array<{ month: string; actual: number }>
}) {
  const colors = useChartColors()
  const merged = actualSeries?.length
    ? data.map((d) => ({ ...d, actual: actualSeries.find((a) => a.month === d.month)?.actual }))
    : data

  return (
    <div className="h-64 w-full sm:h-80">
      <ResponsiveContainer>
        <AreaChart data={merged} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={32} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyTick(currency)} width={44} />
          <Tooltip
            formatter={(value: number | string, name: string) => [formatMoney(Number(value), currency), name]}
            contentStyle={{
              background: 'rgb(var(--color-surface))',
              border: '1px solid rgb(var(--color-border))',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {seriesNames.map((name, i) => (
            <Area
              key={name}
              type="monotone"
              dataKey={name}
              stackId="debts"
              stroke={colors[i % colors.length]}
              fill={colors[i % colors.length]}
              fillOpacity={0.35}
              strokeWidth={1.5}
            />
          ))}
          {actualSeries?.length ? (
            <Line type="monotone" dataKey="actual" stroke="rgb(var(--color-text))" strokeWidth={2} dot={false} name="Actual" />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Grouped/stacked bar chart of spend per category per month. */
export function SpendChart({
  data,
  categories,
  currency,
}: {
  data: Array<Record<string, number | string>>
  categories: string[]
  currency: string
}) {
  const colors = useChartColors()
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyTick(currency)} width={44} />
          <Tooltip
            formatter={(value: number | string, name: string) => [formatMoney(Number(value), currency), name]}
            contentStyle={{
              background: 'rgb(var(--color-surface))',
              border: '1px solid rgb(var(--color-border))',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {categories.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="spend" fill={colors[i % colors.length]} radius={i === categories.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
