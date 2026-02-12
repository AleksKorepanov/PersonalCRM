import React from 'react'

type IconButtonProps = {
  ariaLabel: string
  onClick?: () => void
  children: React.ReactNode
  dataTestId?: string
}

export default function IconButton({ ariaLabel, onClick, children, dataTestId }: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      onClick={onClick}
      data-testid={dataTestId}
      type="button"
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
