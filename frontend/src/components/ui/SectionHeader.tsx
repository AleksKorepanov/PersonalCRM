import React from 'react'

type SectionHeaderProps = {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  dataTestId?: string
}

export default function SectionHeader({ title, subtitle, actions, dataTestId }: SectionHeaderProps) {
  return (
    <div
      data-testid={dataTestId}
      style={{
        display: 'flex',
        alignItems: subtitle ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
        <div style={{ fontSize: 'var(--font-2xl)', fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}
