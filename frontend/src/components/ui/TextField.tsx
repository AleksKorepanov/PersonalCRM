import React from 'react'

type TextFieldProps = {
  label: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string | null
  required?: boolean
  disabled?: boolean
  type?: string
  name?: string
  dataTestId?: string
}

export default function TextField({
  label,
  placeholder,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
  type = 'text',
  name,
  dataTestId,
}: TextFieldProps) {
  return (
    <label style={{ display: 'grid', gap: 6, width: '100%' }}>
      <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text)' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        data-testid={dataTestId}
        style={{
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${error ? '#d14343' : 'var(--color-border)'}`,
          background: disabled ? '#f5f5f5' : 'var(--color-surface)',
          fontSize: 'var(--font-md)',
        }}
      />
      {error && <span style={{ fontSize: 12, color: '#b00020' }}>{error}</span>}
    </label>
  )
}
