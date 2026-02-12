import React from 'react'

type CardProps = {
  children: React.ReactNode
  padding?: string
  style?: React.CSSProperties
  dataTestId?: string
}

export default function Card({ children, padding = 'var(--space-4)', style, dataTestId }: CardProps) {
  return (
    <div
      data-testid={dataTestId}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding,
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
