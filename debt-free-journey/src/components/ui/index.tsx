'use client'

import React from 'react'

// Small shadcn-style primitive set. Every visual decision defers to the theme
// tokens (src/app/theme.css), so restyling happens there, not here.

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variant === 'primary' && 'bg-primary text-primary-fg hover:bg-primary/90',
        variant === 'secondary' && 'bg-surface2 text-text hover:bg-border',
        variant === 'ghost' && 'text-muted hover:bg-surface2 hover:text-text',
        variant === 'danger' && 'bg-danger/10 text-danger hover:bg-danger/20',
        size === 'sm' && 'px-2.5 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        className,
      )}
      {...props}
    />
  )
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-sm', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('mb-2 text-sm font-semibold text-muted', className)} {...props} />
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-sm font-medium', className)} {...props} />
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/20',
          className,
        )}
        {...props}
      />
    )
  },
)

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  tone = 'default',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'default' && 'bg-surface2 text-muted',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'warning' && 'bg-warning/10 text-warning',
        tone === 'danger' && 'bg-danger/10 text-danger',
        tone === 'primary' && 'bg-primary/10 text-primary',
        className,
      )}
      {...props}
    />
  )
}

export function Progress({
  value,
  tone = 'primary',
  className,
}: {
  value: number
  tone?: 'primary' | 'success' | 'accent'
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface2', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-700',
          tone === 'primary' && 'bg-primary',
          tone === 'success' && 'bg-success',
          tone === 'accent' && 'bg-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-surface p-5 shadow-xl sm:max-w-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}
