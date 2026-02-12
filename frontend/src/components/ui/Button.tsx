import React from 'react'
import { t } from '../../i18n/t'

type ButtonVariant = 'primary' | 'secondary'

type ButtonProps = {
  children: React.ReactNode
  variant?: ButtonVariant
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: () => void
  dataTestId?: string
}

export default function Button({
  children,
  variant = 'primary',
  loading = false,
  loadingLabel = t('buttonLoading'),
  disabled = false,
  type = 'button',
  onClick,
  dataTestId,
}: ButtonProps) {
  const isDisabled = disabled || loading
  const baseStyle: React.CSSProperties = {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    fontSize: 'var(--font-md)',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.7 : 1,
    transition: 'background 0.2s ease',
  }

  const variantStyle: React.CSSProperties =
    variant === 'secondary'
      ? { background: '#f3f4f6', color: 'var(--color-text)', borderColor: 'var(--color-border)' }
      : { background: 'var(--color-primary)', color: '#fff' }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      data-testid={dataTestId}
      style={{ ...baseStyle, ...variantStyle }}
    >
      {loading ? loadingLabel : children}
    </button>
  )
}
