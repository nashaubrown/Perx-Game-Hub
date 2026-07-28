'use client'

import { useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from '@/components/ui'
import { useApi, apiSend, dateLabel, todayInputValue } from '@/lib/client'
import { formatMoney, toMajor, toMinor } from '@/lib/money'

interface PaymentRow {
  id: string
  debtId: string
  date: string
  amount: number
  kind: string
  note: string | null
  autoLogged: boolean
  debt: { name: string }
}

interface DebtOption {
  id: string
  name: string
  balance: number
  minPayment: number
}

export default function PaymentsPage() {
  const [filter, setFilter] = useState('')
  const { data, loading, reload } = useApi<{ payments: PaymentRow[] }>(
    filter ? `/api/payments?debtId=${filter}` : '/api/payments',
  )
  const { data: debtData } = useApi<{ debts: DebtOption[] }>('/api/debts')
  const [form, setForm] = useState<{ id?: string; debtId: string; amount: string; date: string; note: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const debts = useMemo(() => debtData?.debts ?? [], [debtData])

  async function submit() {
    if (!form) return
    setSaving(true)
    try {
      if (form.id) {
        await apiSend(`/api/payments/${form.id}`, 'PUT', {
          amount: toMinor(form.amount),
          date: new Date(form.date).toISOString(),
          note: form.note || null,
        })
      } else {
        await apiSend('/api/payments', 'POST', {
          debtId: form.debtId,
          amount: toMinor(form.amount),
          date: new Date(form.date).toISOString(),
          note: form.note || null,
        })
      }
      setForm(null)
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Payments</h1>
        <Button
          onClick={() => {
            const first = debts.find((d) => d.balance > 0) ?? debts[0]
            setForm({
              debtId: first?.id ?? '',
              amount: first ? String(toMajor(first.minPayment)) : '',
              date: todayInputValue(),
              note: '',
            })
          }}
          disabled={debts.length === 0}
        >
          + Log payment
        </Button>
      </div>

      <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:w-64">
        <option value="">All debts</option>
        {debts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>

      {loading ? (
        <Spinner />
      ) : (data?.payments ?? []).length === 0 ? (
        <EmptyState title="No payments yet" hint="Log your first payment and watch the countdown move." />
      ) : (
        <Card className="p-0">
          <div className="flex flex-col divide-y divide-border">
            {data!.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.debt.name}</p>
                    {p.kind === 'adjustment' && <Badge tone="warning">balance adjustment</Badge>}
                    {p.autoLogged && <Badge tone="primary">auto</Badge>}
                  </div>
                  <p className="text-xs text-muted">
                    {dateLabel(p.date)}
                    {p.note && <> · {p.note}</>}
                  </p>
                </div>
                <p className={`font-semibold tabular-nums ${p.kind === 'adjustment' ? (p.amount > 0 ? 'text-warning' : 'text-success') : 'text-success'}`}>
                  {p.kind === 'adjustment' ? (p.amount > 0 ? '+' : '−') : '−'}
                  {formatMoney(Math.abs(p.amount))}
                </p>
                <div className="flex gap-1">
                  {p.kind === 'payment' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          id: p.id,
                          debtId: p.debtId,
                          amount: String(toMajor(p.amount)),
                          date: p.date.slice(0, 10),
                          note: p.note ?? '',
                        })
                      }
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!confirm('Delete this entry? Balances recalculate automatically.')) return
                      await apiSend(`/api/payments/${p.id}`, 'DELETE')
                      reload()
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? 'Edit payment' : 'Log payment'}>
        {form && (
          <div className="flex flex-col gap-3">
            {!form.id && (
              <div>
                <label className="mb-1 block text-sm font-medium">Debt</label>
                <Select
                  value={form.debtId}
                  onChange={(e) => {
                    const d = debts.find((x) => x.id === e.target.value)
                    setForm({ ...form, debtId: e.target.value, amount: d ? String(toMajor(d.minPayment)) : form.amount })
                  }}
                >
                  {debts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({formatMoney(d.balance)} left)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Amount</label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Date</label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Note (optional)</label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. extra from bonus" />
            </div>
            <Button onClick={submit} disabled={saving || toMinor(form.amount) <= 0 || !form.debtId}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
