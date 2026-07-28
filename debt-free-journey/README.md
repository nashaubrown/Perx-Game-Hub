# 🧭 Debt-Free Journey

A personal debt payoff coach: add your income, expenses and debts, and it
answers the one question that matters — **"When will I be debt-free?"** — then
guides you month by month until you get there.

Built with Next.js 14 (App Router) + TypeScript, Tailwind CSS, Prisma + SQLite,
and Recharts. Single-user by design, but every entity hangs off a `Profile` so
multi-user auth can be added later.

## Quick start

```bash
cd debt-free-journey
npm install
cp .env.example .env
npm run setup        # creates the SQLite db and seeds demo data
npm run dev          # http://localhost:3000
```

The seed gives you a demo profile (salary 30,000 MVR, five expenses) and four
mixed debts — a credit card with a *monthly* rate, a 5%/year reducing-balance
loan, a fixed-profit Islamic financing without ibra', and a 1% staff loan — so
every feature is visible immediately. Delete them in **Debts** and add your own,
or re-run `npm run db:seed` to reset.

```bash
npm test             # 34 unit tests: simulation engine + import pipeline
npm run typecheck
```

## What it does

- **Dashboard countdown** — projected debt-free date, months remaining, total
  remaining/paid, projected interest and interest saved vs paying minimums,
  principal progress, per-debt payoff order with mini progress bars.
- **Strategy engine** — Avalanche (highest *effective annual rate* first — a
  0.5%/month card is ~6.17%/year), Snowball (smallest balance first), or a
  custom drag-to-reorder priority. An explicit "Avalanche vs Snowball" card
  shows the months/interest difference so you choose motivation vs math openly.
- **Correct Islamic-financing handling** — fixed-profit debts model the
  contracted profit explicitly. With ibra' (early-settlement rebate), settling
  early waives remaining profit; **without ibra', prepayment saves zero and the
  planner deprioritizes the debt** — enforced in the engine and covered by tests.
- **What-if simulator** — budget slider, lump sums, per-debt ibra' toggles;
  side-by-side scenario cards (current / minimums-only / pinned) plus a
  month-by-month schedule table.
- **Monthly coach** — a concrete payday plan ("Pay X to A, Y to B — total N")
  with check-offs that pre-fill payment logging. Pay less and it recalculates
  honestly but kindly; pay more and it celebrates the pulled-in date.
- **Payment logging** — fast entry, editable/deletable, history filterable by
  debt. Balances are always *derived* (starting balance − payments ±
  adjustments), never overwritten.
- **Statement import** — drag-and-drop PDF/CSV/XLSX bank and credit-card
  statements. Rules first (BML layouts built in, parsers pluggable per bank),
  optional Claude AI fallback (`ANTHROPIC_API_KEY`, zod-validated, feature
  flagged — the app is fully functional offline without it). Fully automatic:
  dedupe by fingerprint, auto-categorize via an editable keyword table, detect
  loan payments per-debt patterns, reconcile card closing balances (large
  deltas require your confirmation — the single exception to automatic mode),
  and **undo any entire import in one click**.
- **Insights** — spend by category over time, estimated vs actual (3-month
  rolling averages, which also replace your estimates in the plan), month-over-
  month changes, and "money leaks" with their impact on your debt-free date.
- **Milestones** — first payment, 25/50/75% cleared, each debt cleared, and
  DEBT FREE — with confetti.

## Money math

All amounts are stored and computed in **integer minor units** (laari); no
floating-point drift. Rate periods (per-month vs per-year) are first-class and
normalized to effective annual rates for comparison. Every projection is
labeled an estimate — this is a planning tool, not financial advice.

## Restyling

The entire look is driven by design tokens in `src/app/theme.css` — four theme
presets (including a dark one) ship in Settings → Appearance. See
[THEME.md](./THEME.md).

## Project layout

```
prisma/schema.prisma        # Profile, Expense, Debt, Payment, StatementImport,
                            # Transaction, CategoryRule, Milestone
src/lib/engine/             # pure simulation engine (tested, no UI imports)
src/lib/import/             # parsers, dedupe, categorize, apply/undo (tested)
src/lib/overview.ts         # dashboard/plan aggregation
src/app/api/                # REST-ish API routes
src/app/                    # pages: dashboard, onboarding, debts, simulator,
                            # plan, payments, imports, insights, settings
fixtures/                   # sample statements used by tests
```
