import React, { createContext, useContext, useMemo, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

type ToastItem = {
  id: string
  type: ToastType
  message: string
}

type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const typeStyles: Record<ToastType, { background: string; border: string }> = {
  success: { background: '#ecfdf3', border: '#34c38f' },
  error: { background: '#fff1f0', border: '#ff4d4f' },
  info: { background: '#eef4ff', border: '#2f6fed' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  const pushToast = (type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, type, message }])
    window.setTimeout(() => removeToast(id), 3500)
  }

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => pushToast('success', message),
      error: (message) => pushToast('error', message),
      info: (message) => pushToast('info', message),
    }),
    [],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        data-testid="toast-container"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'grid',
          gap: 8,
          zIndex: 2000,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-testid="toast-item"
            data-type={toast.type}
            style={{
              minWidth: 220,
              maxWidth: 360,
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${typeStyles[toast.type].border}`,
              background: typeStyles[toast.type].background,
              color: '#111',
              fontSize: 14,
              boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
