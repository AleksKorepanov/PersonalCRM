import React, { useState } from 'react'
import AssistantMessageModal from '../components/AssistantMessageModal'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import { useToast } from '../components/ui/Toast'
import type { AssistantMessageCreate, Reminder } from '../types'
import { t } from '../i18n/t'

type RemindersPageProps = {
  role: 'owner' | 'assistant'
  reminders: Reminder[]
  remindersLoading: boolean
  reminderError: string | null
  reminderForm: { type: string; title: string; dueAt: string }
  onReminderFormChange: React.Dispatch<React.SetStateAction<{ type: string; title: string; dueAt: string }>>
  onCreateReminder: () => void
  onRefreshReminders: () => void
  createAssistantMessage: (payload: AssistantMessageCreate) => Promise<void>
}

export default function RemindersPage({
  role,
  reminders,
  remindersLoading,
  reminderError,
  reminderForm,
  onReminderFormChange,
  onCreateReminder,
  onRefreshReminders,
  createAssistantMessage,
}: RemindersPageProps) {
  const toast = useToast()
  const [assistantModalOpen, setAssistantModalOpen] = useState(false)
  const [assistantSubmitting, setAssistantSubmitting] = useState(false)
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null)

  const statusLabel = (status: string) => {
    if (status === 'open') return t('remindersStatusOpen')
    if (status === 'done') return t('remindersStatusDone')
    return status
  }

  const typeLabel = (type: string) => {
    if (type === 'follow_up') return t('remindersTypeFollowUp')
    if (type === 'birthday') return t('remindersTypeBirthday')
    if (type === 'anniversary') return t('remindersTypeAnniversary')
    if (type === 'task') return t('remindersTypeTask')
    if (type === 'custom') return t('remindersTypeCustom')
    return type
  }

  const handleAssistantMessageSubmit = async (payload: { task: string; reason?: string; due_at?: string }) => {
    if (!selectedReminder || assistantSubmitting) return
    setAssistantSubmitting(true)
    try {
      await createAssistantMessage({
        target_type: 'reminder',
        target_id: selectedReminder.id,
        task: payload.task,
        reason: payload.reason,
        due_at: payload.due_at,
      })
      toast.success(t('assistantMessageSent'))
      setAssistantModalOpen(false)
      setSelectedReminder(null)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('assistantMessageFailed')}: ${detail}` : t('assistantMessageFailed')
      toast.error(message)
    } finally {
      setAssistantSubmitting(false)
    }
  }

  return (
    <section style={{ marginTop: 'var(--space-3)' }}>
      <SectionHeader title={t('remindersTitle')} />
      {remindersLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
      {reminderError && <Alert type="error">{reminderError}</Alert>}
      <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <label>
          {t('remindersTypeLabel')}:
          <select
            data-testid="reminder-type"
            value={reminderForm.type}
            onChange={(e) => onReminderFormChange((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="follow_up">{t('remindersTypeFollowUp')}</option>
            <option value="birthday">{t('remindersTypeBirthday')}</option>
            <option value="anniversary">{t('remindersTypeAnniversary')}</option>
            <option value="task">{t('remindersTypeTask')}</option>
            <option value="custom">{t('remindersTypeCustom')}</option>
          </select>
        </label>
        <input
          data-testid="reminder-title"
          placeholder={t('remindersTitleLabel')}
          value={reminderForm.title}
          onChange={(e) => onReminderFormChange((prev) => ({ ...prev, title: e.target.value }))}
        />
        <label>
          {t('remindersDueLabel')}:
          <input
            data-testid="reminder-due"
            value={reminderForm.dueAt}
            onChange={(e) => onReminderFormChange((prev) => ({ ...prev, dueAt: e.target.value }))}
          />
        </label>
        <button data-testid="reminder-create" onClick={onCreateReminder}>
          {t('remindersCreateButton')}
        </button>
      </div>

      <div style={{ marginTop: 16 }} data-testid="reminders-table">
        {!remindersLoading && !reminderError && reminders.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('remindersEmpty')}</div>
        )}
        {reminders.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ background: '#f9fafb', textAlign: 'left' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>{t('remindersTableTitle')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('remindersTableType')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('remindersTableStatus')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('remindersTableDue')}</th>
                  <th style={{ padding: '10px 12px' }} />
                </tr>
              </thead>
              <tbody>
                {reminders.map((item) => (
                  <tr key={item.id} style={{ borderTop: '1px solid #eef0f2' }} data-testid={`reminder-row-${item.id}`}>
                    <td style={{ padding: '10px 12px' }}>{item.title || t('remindersUntitled')}</td>
                    <td style={{ padding: '10px 12px' }}>{typeLabel(item.type)}</td>
                    <td style={{ padding: '10px 12px' }}>{statusLabel(item.status)}</td>
                    <td style={{ padding: '10px 12px' }}>{new Date(item.due_at).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {role === 'assistant' && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSelectedReminder(item)
                            setAssistantModalOpen(true)
                          }}
                        >
                          {t('assistantMessageButton')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <Button variant="secondary" dataTestId="reminders-refresh" onClick={onRefreshReminders}>
          {t('remindersRefresh')}
        </Button>
      </div>
      <AssistantMessageModal
        open={assistantModalOpen}
        targetLabel={
          selectedReminder
            ? `${t('assistantMessageTargetReminder')}: ${selectedReminder.title || t('remindersUntitled')}`
            : null
        }
        submitting={assistantSubmitting}
        onClose={() => {
          setAssistantModalOpen(false)
          setSelectedReminder(null)
        }}
        onSubmit={handleAssistantMessageSubmit}
      />
    </section>
  )
}
