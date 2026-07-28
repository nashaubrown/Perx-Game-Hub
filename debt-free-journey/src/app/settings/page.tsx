'use client'

import { useEffect, useState } from 'react'
import { Button, Card, CardTitle, Input, Label, Select, Spinner, cn } from '@/components/ui'
import { useApi, apiSend } from '@/lib/client'
import { toMajor, toMinor } from '@/lib/money'

interface ProfilePayload {
  profile: {
    id: string
    name: string
    monthlyIncome: number
    currency: string
    paydayDay: number
    strategy: string
    debtBudget: number | null
    expenses: Array<{ id: string; name: string; amount: number }>
  } | null
}

interface RuleRow {
  id: string
  keyword: string
  category: string
}

const THEMES = [
  { id: 'ocean', label: 'Ocean', swatch: '#0d6efd' },
  { id: 'forest', label: 'Forest', swatch: '#227a4a' },
  { id: 'sunset', label: 'Sunset', swatch: '#ea580c' },
  { id: 'midnight', label: 'Midnight (dark)', swatch: '#0c101a' },
]

export default function SettingsPage() {
  const { data, loading, reload } = useApi<ProfilePayload>('/api/profile')
  const { data: rulesData, reload: reloadRules } = useApi<{ rules: RuleRow[] }>('/api/categories')
  const [form, setForm] = useState<{
    income: string
    currency: string
    payday: string
    strategy: string
    budget: string
    expenses: Array<{ name: string; amount: string }>
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newRule, setNewRule] = useState({ keyword: '', category: '' })
  const [theme, setTheme] = useState('ocean')

  useEffect(() => {
    setTheme(localStorage.getItem('dfj-theme') ?? 'ocean')
  }, [])

  useEffect(() => {
    const p = data?.profile
    if (p && !form) {
      setForm({
        income: String(toMajor(p.monthlyIncome)),
        currency: p.currency,
        payday: String(p.paydayDay),
        strategy: p.strategy,
        budget: p.debtBudget !== null ? String(toMajor(p.debtBudget)) : '',
        expenses: p.expenses.map((e) => ({ name: e.name, amount: String(toMajor(e.amount)) })),
      })
    }
  }, [data, form])

  function applyTheme(id: string) {
    setTheme(id)
    document.documentElement.dataset.theme = id
    localStorage.setItem('dfj-theme', id)
  }

  if (loading || !form) return <Spinner />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardTitle>Appearance</CardTitle>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              className={cn(
                'flex items-center gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors',
                theme === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-surface2',
              )}
            >
              <span className="h-4 w-4 rounded-full border border-border" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Themes are design-token presets — add your own in <code>src/app/theme.css</code> (see THEME.md).
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>Profile & budget</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Monthly income</Label>
            <Input inputMode="decimal" value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency} maxLength={5} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <Label>Payday (day of month)</Label>
            <Input inputMode="numeric" value={form.payday} onChange={(e) => setForm({ ...form, payday: e.target.value })} />
          </div>
          <div>
            <Label>Strategy</Label>
            <Select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
              <option value="avalanche">Avalanche (least interest)</option>
              <option value="snowball">Snowball (quick wins)</option>
              <option value="custom">Custom order</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Monthly debt budget (leave empty to use all free cash flow)</Label>
          <Input inputMode="decimal" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="auto" />
        </div>

        <CardTitle className="mt-2">Monthly expenses (estimates)</CardTitle>
        {form.expenses.map((e, i) => (
          <div key={i} className="flex gap-2">
            <Input value={e.name} onChange={(ev) => setForm({ ...form, expenses: form.expenses.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} />
            <Input className="w-32" inputMode="decimal" value={e.amount} onChange={(ev) => setForm({ ...form, expenses: form.expenses.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)) })} />
            <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, expenses: form.expenses.filter((_, j) => j !== i) })}>✕</Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setForm({ ...form, expenses: [...form.expenses, { name: '', amount: '' }] })}>
          + Add expense
        </Button>

        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            setSaved(false)
            try {
              await apiSend('/api/profile', 'PUT', {
                monthlyIncome: toMinor(form.income || '0'),
                currency: form.currency || 'MVR',
                paydayDay: parseInt(form.payday, 10) || 1,
                strategy: form.strategy,
                debtBudget: form.budget.trim() ? toMinor(form.budget) : null,
                onboarded: true,
                expenses: form.expenses
                  .filter((e) => e.name.trim() && e.amount.trim())
                  .map((e) => ({ name: e.name.trim(), amount: toMinor(e.amount) })),
              })
              setSaved(true)
              reload()
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        {saved && <p className="text-sm text-success">Saved ✓</p>}
      </Card>

      <Card>
        <CardTitle>Auto-categorization rules</CardTitle>
        <p className="mb-2 text-xs text-muted">
          Imported transactions whose description contains a keyword get that category. First match wins.
        </p>
        <div className="mb-3 flex gap-2">
          <Input placeholder="Keyword e.g. NETFLIX" value={newRule.keyword} onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })} />
          <Input placeholder="Category e.g. Subscriptions" value={newRule.category} onChange={(e) => setNewRule({ ...newRule, category: e.target.value })} />
          <Button
            size="sm"
            disabled={!newRule.keyword.trim() || !newRule.category.trim()}
            onClick={async () => {
              await apiSend('/api/categories', 'POST', { keyword: newRule.keyword.trim(), category: newRule.category.trim() })
              setNewRule({ keyword: '', category: '' })
              reloadRules()
            }}
          >
            Add
          </Button>
        </div>
        <div className="flex flex-col divide-y divide-border text-sm">
          {(rulesData?.rules ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1.5">
              <span>
                <code className="rounded bg-surface2 px-1.5 py-0.5 text-xs">{r.keyword}</code> → {r.category}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await apiSend(`/api/categories?id=${r.id}`, 'DELETE')
                  reloadRules()
                }}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
