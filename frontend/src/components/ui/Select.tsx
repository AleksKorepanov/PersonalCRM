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
      <span style={{ fontSize: 13, color: '#333' }}>
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
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${error ? '#d14343' : '#d1d5db'}`,
          background: disabled ? '#f5f5f5' : '#fff',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span style={{ fontSize: 12, color: '#b00020' }}>{error}</span>}
    </label>
  )
}
