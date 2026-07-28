'use client'

import { useState } from 'react'
import { Button, Input, Label, Select, Switch } from '@/components/ui'
import { apiSend } from '@/lib/client'
import { toMinor } from '@/lib/money'
import { DEBT_CATEGORIES } from '@/lib/debts'

export interface DebtFormValues {
  id?: string
  name: string
  category: string
  principal: string
  startingBalance: string
  ratePercent: string
  ratePeriod: string
  interestMethod: string
  ibraAvailable: boolean
  totalPayable: string
  minPayment: string
  matchPatterns: string
}

export function emptyDebtForm(): DebtFormValues {
  return {
    name: '',
    category: 'personal_loan',
    principal: '',
    startingBalance: '',
    ratePercent: '',
    ratePeriod: 'per_year',
    interestMethod: 'reducing_balance',
    ibraAvailable: false,
    totalPayable: '',
    minPayment: '',
    matchPatterns: '',
  }
}

export function DebtForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: DebtFormValues
  onSaved: () => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<DebtFormValues>) => setForm((f) => ({ ...f, ...patch }))

  const isFixedProfit = form.interestMethod === 'fixed_profit'
  const isZero = form.interestMethod === 'zero_interest'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name,
        category: form.category,
        principal: toMinor(form.principal),
        startingBalance: toMinor(form.startingBalance || form.principal),
        ratePercent: isZero ? 0 : parseFloat(form.ratePercent || '0'),
        ratePeriod: form.ratePeriod,
        interestMethod: form.interestMethod,
        ibraAvailable: isFixedProfit ? form.ibraAvailable : false,
        totalPayable: isFixedProfit && form.totalPayable ? toMinor(form.totalPayable) : null,
        minPayment: toMinor(form.minPayment),
        matchPatterns: form.matchPatterns,
      }
      if (form.id) await apiSend(`/api/debts/${form.id}`, 'PUT', payload)
      else await apiSend('/api/debts', 'POST', payload)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="debt-name">Name</Label>
        <Input id="debt-name" required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. BML Credit Card" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Category</Label>
          <Select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {DEBT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Minimum payment / month</Label>
          <Input required inputMode="decimal" value={form.minPayment} onChange={(e) => set({ minPayment: e.target.value })} placeholder="2000" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Original principal</Label>
          <Input required inputMode="decimal" value={form.principal} onChange={(e) => set({ principal: e.target.value })} placeholder="45000" />
        </div>
        <div>
          <Label>Current balance</Label>
          <Input inputMode="decimal" value={form.startingBalance} onChange={(e) => set({ startingBalance: e.target.value })} placeholder="same as principal" />
        </div>
      </div>

      <div>
        <Label>Interest method</Label>
        <Select value={form.interestMethod} onChange={(e) => set({ interestMethod: e.target.value })}>
          <option value="reducing_balance">Reducing balance — normal loans & cards</option>
          <option value="fixed_profit">Fixed profit — Islamic financing</option>
          <option value="zero_interest">Zero interest — 0% loans</option>
        </Select>
        <p className="mt-1 text-xs text-muted">
          {form.interestMethod === 'reducing_balance' &&
            'Interest accrues monthly on whatever you still owe. Paying early always saves interest.'}
          {isFixedProfit &&
            'The total profit is fixed in the contract up front (common in Islamic financing). Whether early payment helps depends on the ibra’ rebate below.'}
          {isZero && 'No interest at all — you only ever repay what you borrowed.'}
        </p>
      </div>

      {!isZero && !isFixedProfit && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Interest rate %</Label>
            <Input required inputMode="decimal" value={form.ratePercent} onChange={(e) => set({ ratePercent: e.target.value })} placeholder="e.g. 5" />
          </div>
          <div>
            <Label>Rate period</Label>
            <Select value={form.ratePeriod} onChange={(e) => set({ ratePeriod: e.target.value })}>
              <option value="per_year">Per year</option>
              <option value="per_month">Per month</option>
            </Select>
            <p className="mt-1 text-xs text-muted">
              Check your contract! Cards often quote <em>monthly</em> rates — 2%/month is ~26.8%/year, very different
              from 2%/year.
            </p>
          </div>
        </div>
      )}

      {isFixedProfit && (
        <>
          <div>
            <Label>Total payable under the contract (principal + profit)</Label>
            <Input inputMode="decimal" value={form.totalPayable} onChange={(e) => set({ totalPayable: e.target.value })} placeholder="e.g. 72000" />
            <p className="mt-1 text-xs text-muted">Used to work out how much of your balance is profit.</p>
          </div>
          <div className="rounded border border-border bg-surface2 p-3">
            <Switch
              checked={form.ibraAvailable}
              onChange={(v) => set({ ibraAvailable: v })}
              label="Early settlement rebate (ibra’) available"
            />
            <p className="mt-2 text-xs text-muted">
              {form.ibraAvailable
                ? 'Settling early waives the remaining profit — early payment genuinely saves money.'
                : 'Without ibra’, paying early saves nothing: the full contract total is due either way, so the plan deprioritizes extra payments here.'}
            </p>
          </div>
        </>
      )}

      <div>
        <Label>Statement match patterns (one per line, optional)</Label>
        <textarea
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          rows={2}
          value={form.matchPatterns}
          onChange={(e) => set({ matchPatterns: e.target.value })}
          placeholder={'LOAN PAYMENT\nFINANCING'}
        />
        <p className="mt-1 text-xs text-muted">
          Imported statement lines containing any of these are auto-logged as payments on this debt.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add debt'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
