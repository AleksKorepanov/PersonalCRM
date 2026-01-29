import React, { useEffect, useState } from 'react'
import Button from './ui/Button'
import TextField from './ui/TextField'
import { t } from '../i18n/t'

type AssistantMessageModalProps = {
  open: boolean
  targetLabel?: string | null
  submitting: boolean
  onClose: () => void
  onSubmit: (payload: { task: string; reason?: string; due_at?: string }) => void
}

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export default function AssistantMessageModal({ open, targetLabel, submitting, onClose, onSubmit }: AssistantMessageModalProps) {
  const [task, setTask] = useState('')
  const [reason, setReason] = useState('')
  const [dueAt, setDueAt] = useState(toLocalInputValue(new Date()))

  useEffect(() => {
    if (!open) return
    setTask('')
    setReason('')
    setDueAt(toLocalInputValue(new Date()))
  }, [open])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#fff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('assistantMessageTitle')}</h3>
          <Button variant="secondary" onClick={onClose}>
            {t('assistantMessageClose')}
          </Button>
        </div>
        {targetLabel && <div style={{ fontSize: 13, color: '#666' }}>{targetLabel}</div>}
        <TextField
          label={t('assistantMessageTaskLabel')}
          value={task}
          onChange={setTask}
          required
          placeholder={t('assistantMessageTaskPlaceholder')}
        />
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#333' }}>{t('assistantMessageReasonLabel')}</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
          />
        </label>
        <TextField
          label={t('assistantMessageDueLabel')}
          value={dueAt}
          onChange={setDueAt}
          type="datetime-local"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>
            {t('assistantMessageCancel')}
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                task: task.trim(),
                reason: reason.trim() || undefined,
                due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
              })
            }
            loading={submitting}
            disabled={submitting || !task.trim()}
          >
            {t('assistantMessageSend')}
          </Button>
        </div>
      </div>
    </div>
  )
}
