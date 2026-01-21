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
      <span style={{ fontSize: 13, color: '#333' }}>
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
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${error ? '#d14343' : '#d1d5db'}`,
          background: disabled ? '#f5f5f5' : '#fff',
        }}
      />
      {error && <span style={{ fontSize: 12, color: '#b00020' }}>{error}</span>}
    </label>
  )
}
