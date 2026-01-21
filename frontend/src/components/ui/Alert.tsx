import React from 'react'

type AlertType = 'error' | 'info' | 'success'

type AlertProps = {
  type?: AlertType
  children: React.ReactNode
}

const typeStyles: Record<AlertType, React.CSSProperties> = {
  error: { background: '#fde7e7', color: '#8a1f1f', borderColor: '#f1b0b0' },
  info: { background: '#eef4ff', color: '#1f3b73', borderColor: '#c7d7ff' },
  success: { background: '#e6f6ec', color: '#1f5e3a', borderColor: '#bce5cc' },
}

export default function Alert({ type = 'info', children }: AlertProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid',
        fontSize: 13,
        ...typeStyles[type],
      }}
    >
      {children}
    </div>
  )
}
