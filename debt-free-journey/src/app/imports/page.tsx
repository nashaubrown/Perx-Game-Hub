'use client'

import { useRef, useState } from 'react'
import { Badge, Button, Card, CardTitle, Select, Spinner } from '@/components/ui'
import { useApi, dateLabel } from '@/lib/client'
import { formatMoney } from '@/lib/money'

interface ImportRow {
  id: string
  filename: string
  statementType: string
  parseMethod: string
  parserName: string | null
  status: string
  createdAt: string
  periodStart: string | null
  periodEnd: string | null
  summary: string
  _count: { transactions: number; payments: number }
}

interface Summary {
  transactionsAdded: number
  duplicatesSkipped: number
  paymentsDetected: number
  balanceAdjustment: number | null
  pendingAdjustment: { debtName: string; delta: number } | null
  method: string
  parserName: string
}

export default function ImportsPage() {
  const { data, loading, reload } = useApi<{ imports: ImportRow[]; aiEnabled: boolean }>('/api/imports')
  const { data: debtData } = useApi<{ debts: Array<{ id: string; name: string; category: string }> }>('/api/debts')
  const [statementType, setStatementType] = useState<'bank_account' | 'credit_card'>('bank_account')
  const [cardDebtId, setCardDebtId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const cards = (debtData?.debts ?? []).filter((d) => d.category === 'credit_card')

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('statementType', statementType)
      if (statementType === 'credit_card' && cardDebtId) fd.append('cardDebtId', cardDebtId)
      const res = await fetch('/api/imports', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      setResult(json.summary)
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Statement imports</h1>
      <p className="text-sm text-muted">
        Upload bank or credit-card statements (PDF, CSV, Excel). Transactions apply automatically: deduped,
        categorized, loan payments detected, card balances reconciled — and any import can be fully undone.
      </p>

      <Card className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Statement type</label>
            <Select value={statementType} onChange={(e) => setStatementType(e.target.value as any)}>
              <option value="bank_account">Bank account</option>
              <option value="credit_card">Credit card</option>
            </Select>
          </div>
          {statementType === 'credit_card' && cards.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium">Which card?</label>
              <Select value={cardDebtId} onChange={(e) => setCardDebtId(e.target.value)}>
                <option value="">Auto-detect</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) upload(file)
          }}
          onClick={() => fileInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <span className="text-3xl">📄</span>
          <p className="font-medium">{uploading ? 'Importing…' : 'Drop a statement here or tap to choose'}</p>
          <p className="text-xs text-muted">PDF, CSV, XLSX · stored locally only</p>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".pdf,.csv,.xlsx,.xls,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
        </div>

        {!data?.aiEnabled && (
          <p className="text-xs text-muted">
            AI fallback is off (no ANTHROPIC_API_KEY set) — rule-based parsing only, which covers BML CSV and PDF
            layouts. Everything stays on your machine.
          </p>
        )}
        {error && <p className="rounded bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {result && (
          <div className="rounded bg-success/10 p-3 text-sm">
            <p className="font-medium text-success">Import applied ✓ ({result.method === 'ai' ? 'AI parser' : `rules: ${result.parserName}`})</p>
            <ul className="mt-1 list-inside list-disc text-text/80">
              <li>{result.transactionsAdded} transactions added</li>
              <li>{result.duplicatesSkipped} duplicates skipped</li>
              <li>{result.paymentsDetected} loan payments auto-logged</li>
              {result.balanceAdjustment !== null && (
                <li>card balance adjusted by {formatMoney(result.balanceAdjustment)}</li>
              )}
              {result.pendingAdjustment && (
                <li className="text-warning">
                  large balance difference on {result.pendingAdjustment.debtName} (
                  {formatMoney(result.pendingAdjustment.delta)}) — confirm it from the dashboard
                </li>
              )}
            </ul>
          </div>
        )}
      </Card>

      <h2 className="font-semibold">History</h2>
      {loading ? (
        <Spinner />
      ) : (data?.imports ?? []).length === 0 ? (
        <p className="text-sm text-muted">No imports yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data!.imports.map((imp) => {
            let s: Partial<Summary> = {}
            try {
              s = JSON.parse(imp.summary)
            } catch {}
            return (
              <Card key={imp.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{imp.filename}</p>
                      <Badge>{imp.statementType === 'credit_card' ? 'card' : 'bank'}</Badge>
                      <Badge tone={imp.parseMethod === 'ai' ? 'primary' : 'default'}>
                        {imp.parseMethod === 'ai' ? 'AI parsed' : imp.parserName ?? 'rules'}
                      </Badge>
                      {imp.status === 'undone' && <Badge tone="danger">undone</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {dateLabel(imp.createdAt)}
                      {imp.periodStart && imp.periodEnd && (
                        <> · covers {dateLabel(imp.periodStart)} – {dateLabel(imp.periodEnd)}</>
                      )}
                      {' · '}
                      {s.transactionsAdded ?? imp._count.transactions} txns, {s.paymentsDetected ?? imp._count.payments}{' '}
                      payments, {s.duplicatesSkipped ?? 0} dupes skipped
                    </p>
                  </div>
                  {imp.status === 'applied' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        if (!confirm(`Undo the entire import of ${imp.filename}? Transactions, auto-logged payments and adjustments are all reverted.`)) return
                        await fetch(`/api/imports/${imp.id}/undo`, { method: 'POST' })
                        reload()
                      }}
                    >
                      Undo import
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
