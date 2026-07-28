'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Card, Input, Label, Progress } from '@/components/ui'
import { DebtForm, emptyDebtForm } from '@/components/DebtForm'
import { apiSend, useApi } from '@/lib/client'
import { formatMoney, toMinor } from '@/lib/money'

interface ExpenseDraft {
  name: string
  amount: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [income, setIncome] = useState('')
  const [currency, setCurrency] = useState('MVR')
  const [payday, setPayday] = useState('28')
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([{ name: 'Rent', amount: '' }])
  const [debtCount, setDebtCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const { data: debtData, reload: reloadDebts } = useApi<{ debts: Array<{ minPayment: number; balance: number }> }>('/api/debts')

  useEffect(() => {
    if (debtData) setDebtCount(debtData.debts.length)
  }, [debtData])

  const steps = ['Income', 'Expenses', 'Debts', 'Summary']

  async function saveProfile(onboarded: boolean) {
    setSaving(true)
    try {
      await apiSend('/api/profile', 'PUT', {
        monthlyIncome: toMinor(income || '0'),
        currency,
        paydayDay: parseInt(payday, 10) || 1,
        onboarded,
        expenses: expenses
          .filter((e) => e.name.trim() && e.amount.trim())
          .map((e) => ({ name: e.name.trim(), amount: toMinor(e.amount) })),
      })
    } finally {
      setSaving(false)
    }
  }

  const expensesTotal = expenses.reduce((a, e) => a + toMinor(e.amount || '0'), 0)
  const minTotal = (debtData?.debts ?? []).filter((d) => d.balance > 0).reduce((a, d) => a + d.minPayment, 0)
  const freeCashFlow = toMinor(income || '0') - expensesTotal - minTotal

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold">Welcome 👋</h1>
      <div>
        <div className="mb-1 flex justify-between text-xs font-medium text-muted">
          {steps.map((s, i) => (
            <span key={s} className={i === step ? 'text-primary' : ''}>
              {s}
            </span>
          ))}
        </div>
        <Progress value={((step + 1) / steps.length) * 100} />
      </div>

      {step === 0 && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Let’s figure out what you can throw at your debts each month. First: what comes in?
          </p>
          <div>
            <Label>Monthly take-home income</Label>
            <Input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="30000" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} />
            </div>
            <div>
              <Label>Payday (day of month)</Label>
              <Input inputMode="numeric" value={payday} onChange={(e) => setPayday(e.target.value)} placeholder="28" />
            </div>
          </div>
          <Button disabled={!income} onClick={() => setStep(1)}>
            Next: expenses
          </Button>
        </Card>
      )}

      {step === 1 && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Your recurring monthly expenses — rent, groceries, bills. Rough numbers are fine; once you import bank
            statements the app switches to your real averages automatically.
          </p>
          {expenses.map((e, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={e.name}
                onChange={(ev) => setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))}
                placeholder="Name"
              />
              <Input
                className="w-32"
                inputMode="decimal"
                value={e.amount}
                onChange={(ev) => setExpenses((xs) => xs.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))}
                placeholder="Amount"
              />
              <Button variant="ghost" size="sm" onClick={() => setExpenses((xs) => xs.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setExpenses((xs) => [...xs, { name: '', amount: '' }])}>
            + Add expense
          </Button>
          <p className="text-sm">
            Total: <strong>{formatMoney(expensesTotal, currency)}</strong>/month
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={saving}
              onClick={async () => {
                await saveProfile(false)
                setStep(2)
              }}
            >
              Next: debts
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="text-sm text-muted">
              Now add each debt, one at a time. Don’t worry about the jargon — each field explains itself, especially
              the monthly-vs-yearly rate trap.
            </p>
            <p className="mt-2 text-sm font-medium">{debtCount} debt{debtCount === 1 ? '' : 's'} added so far</p>
          </Card>
          <Card>
            <DebtForm
              key={debtCount}
              initial={emptyDebtForm()}
              onSaved={() => {
                reloadDebts()
              }}
            />
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button className="flex-1" onClick={() => setStep(3)} disabled={debtCount === 0}>
              {debtCount === 0 ? 'Add at least one debt' : 'Next: summary'}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Your monthly picture</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Income</dt>
              <dd className="font-medium">{formatMoney(toMinor(income || '0'), currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Expenses</dt>
              <dd className="font-medium">− {formatMoney(expensesTotal, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Minimum debt payments</dt>
              <dd className="font-medium">− {formatMoney(minTotal, currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-semibold">Free cash flow</dt>
              <dd className={`font-bold ${freeCashFlow < 0 ? 'text-danger' : 'text-success'}`}>
                {formatMoney(freeCashFlow, currency)}
              </dd>
            </div>
          </dl>
          {freeCashFlow < 0 ? (
            <p className="rounded bg-danger/10 p-3 text-sm text-danger">
              Heads up: your expenses plus minimum payments exceed your income. The app will still build a plan, but
              look at the Insights page for spending that could be trimmed.
            </p>
          ) : (
            <p className="rounded bg-success/10 p-3 text-sm text-success">
              {formatMoney(freeCashFlow, currency)}/month available to accelerate your payoff. Let’s put it to work.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              className="flex-1"
              disabled={saving}
              onClick={async () => {
                await saveProfile(true)
                router.push('/')
              }}
            >
              See my debt-free date →
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
