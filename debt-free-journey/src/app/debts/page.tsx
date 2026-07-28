'use client'

import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Modal, Spinner } from '@/components/ui'
import { DebtForm, emptyDebtForm, type DebtFormValues } from '@/components/DebtForm'
import { useApi, apiSend } from '@/lib/client'
import { formatMoney, toMajor } from '@/lib/money'
import { DEBT_CATEGORIES } from '@/lib/debts'

interface DebtRow {
  id: string
  name: string
  category: string
  principal: number
  startingBalance: number
  balance: number
  ratePercent: number
  ratePeriod: string
  interestMethod: string
  ibraAvailable: boolean
  totalPayable: number | null
  minPayment: number
  matchPatterns: string
}

export default function DebtsPage() {
  const { data, loading, reload } = useApi<{ debts: DebtRow[] }>('/api/debts')
  const [editing, setEditing] = useState<DebtFormValues | null>(null)

  function toForm(d: DebtRow): DebtFormValues {
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      principal: String(toMajor(d.principal)),
      startingBalance: String(toMajor(d.startingBalance)),
      ratePercent: String(d.ratePercent),
      ratePeriod: d.ratePeriod,
      interestMethod: d.interestMethod,
      ibraAvailable: d.ibraAvailable,
      totalPayable: d.totalPayable ? String(toMajor(d.totalPayable)) : '',
      minPayment: String(toMajor(d.minPayment)),
      matchPatterns: d.matchPatterns,
    }
  }

  if (loading) return <Spinner />
  const debts = data?.debts ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Debts</h1>
        <Button onClick={() => setEditing(emptyDebtForm())}>+ Add debt</Button>
      </div>

      {debts.length === 0 ? (
        <EmptyState
          title="No debts yet"
          hint="Add each loan and card one at a time — the app explains the tricky fields as you go."
          action={<Button onClick={() => setEditing(emptyDebtForm())}>Add your first debt</Button>}
        />
      ) : (
        debts.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{d.name}</p>
                  <Badge>{DEBT_CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}</Badge>
                  {d.balance === 0 && <Badge tone="success">cleared</Badge>}
                  {d.interestMethod === 'fixed_profit' && (
                    <Badge tone={d.ibraAvailable ? 'primary' : 'warning'}>
                      {d.ibraAvailable ? "ibra’ available" : 'no ibra’'}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatMoney(d.balance)} remaining of {formatMoney(d.principal)} ·{' '}
                  {d.interestMethod === 'zero_interest'
                    ? '0% interest'
                    : d.interestMethod === 'fixed_profit'
                      ? `fixed profit${d.totalPayable ? ` (total ${formatMoney(d.totalPayable)})` : ''}`
                      : `${d.ratePercent}% ${d.ratePeriod === 'per_month' ? '/month' : '/year'}`}{' '}
                  · min {formatMoney(d.minPayment)}/mo
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(toForm(d))}>
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    if (!confirm(`Delete ${d.name} and all its payment history?`)) return
                    await apiSend(`/api/debts/${d.id}`, 'DELETE')
                    reload()
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit debt' : 'Add debt'}>
        {editing && (
          <DebtForm
            initial={editing}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}
