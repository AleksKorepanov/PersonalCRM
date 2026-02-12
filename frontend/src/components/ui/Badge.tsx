import React from 'react'

type BadgeVariant = 'neutral' | 'accent' | 'warning'

type BadgeProps = {
  label: string
  variant?: BadgeVariant
  dataTestId?: string
}

const variantStyle = (variant: BadgeVariant): React.CSSProperties => {
  if (variant === 'accent') {
    return { background: '#e8f1ff', color: '#1f4fd7', borderColor: '#cfe0ff' }
  }
  if (variant === 'warning') {
    return { background: '#fff7e6', color: '#9a5b00', borderColor: '#ffe1a6' }
  }
  return { background: '#f4f4f5', color: '#52525b', borderColor: '#e4e4e7' }
}

export default function Badge({ label, variant = 'neutral', dataTestId }: BadgeProps) {
  return (
    <span
      data-testid={dataTestId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        fontSize: 'var(--font-xs)',
        fontWeight: 500,
        ...variantStyle(variant),
      }}
    >
      {label}
    </span>
  )
}
