import React, { useState } from 'react'
import AssistantMessageModal from '../components/AssistantMessageModal'
import Button from '../components/ui/Button'
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
    <section style={{ marginTop: 16 }}>
      <h2>{t('remindersTitle')}</h2>
      {remindersLoading && <div>{t('contactsLoading')}</div>}
      {reminderError && <div style={{ color: '#b00020' }}>{reminderError}</div>}
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

      <ul style={{ marginTop: 12 }} data-testid="reminders-list">
        {reminders.map((item) => (
          <li key={item.id} data-testid={`reminder-row-${item.id}`}>
            {item.title || t('remindersUntitled')} — {item.type} — {new Date(item.due_at).toLocaleString()}
            {role === 'assistant' && (
              <div style={{ marginTop: 6 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedReminder(item)
                    setAssistantModalOpen(true)
                  }}
                >
                  {t('assistantMessageButton')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <button data-testid="reminders-refresh" onClick={onRefreshReminders} style={{ marginTop: 8 }}>
        {t('remindersRefresh')}
      </button>
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
