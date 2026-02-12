import React from 'react'

type SelectOption = {
  value: string
  label: string
}

type SelectProps = {
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  error?: string | null
  disabled?: boolean
  required?: boolean
  name?: string
  dataTestId?: string
}

export default function Select({
  label,
  options,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  name,
  dataTestId,
}: SelectProps) {
  return (
    <label style={{ display: 'grid', gap: 6, width: '100%' }}>
      <span style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text)' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <select
        name={name}
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
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span style={{ fontSize: 'var(--font-xs)', color: '#b00020' }}>{error}</span>}
    </label>
  )
}
