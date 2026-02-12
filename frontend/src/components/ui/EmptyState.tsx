import React from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  dataTestId?: string
}

export default function EmptyState({ title, description, actionLabel, onAction, dataTestId }: EmptyStateProps) {
  return (
    <div
      data-testid={dataTestId}
      style={{
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px dashed var(--color-border)',
        background: 'var(--color-surface)',
        display: 'grid',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ fontWeight: 600 }}>{title}</div>
      {description && <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>{description}</div>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            alignSelf: 'flex-start',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
