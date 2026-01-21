import React from 'react'
import type { Reminder } from '../types'

type RemindersPageProps = {
  reminders: Reminder[]
  remindersLoading: boolean
  reminderError: string | null
  reminderForm: { type: string; title: string; dueAt: string }
  onReminderFormChange: React.Dispatch<React.SetStateAction<{ type: string; title: string; dueAt: string }>>
  onCreateReminder: () => void
  onRefreshReminders: () => void
}

export default function RemindersPage({
  reminders,
  remindersLoading,
  reminderError,
  reminderForm,
  onReminderFormChange,
  onCreateReminder,
  onRefreshReminders,
}: RemindersPageProps) {
  return (
    <section style={{ marginTop: 16 }}>
      <h2>Напоминания</h2>
      {remindersLoading && <div>Загрузка…</div>}
      {reminderError && <div style={{ color: '#b00020' }}>{reminderError}</div>}
      <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <label>
          Тип:
          <select
            data-testid="reminder-type"
            value={reminderForm.type}
            onChange={(e) => onReminderFormChange((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="follow_up">Фоллоу‑ап</option>
            <option value="birthday">День рождения</option>
            <option value="anniversary">Годовщина</option>
            <option value="task">Задача</option>
            <option value="custom">Другое</option>
          </select>
        </label>
        <input
          data-testid="reminder-title"
          placeholder="Заголовок"
          value={reminderForm.title}
          onChange={(e) => onReminderFormChange((prev) => ({ ...prev, title: e.target.value }))}
        />
        <label>
          Срок (ISO):
          <input
            data-testid="reminder-due-at"
            value={reminderForm.dueAt}
            onChange={(e) => onReminderFormChange((prev) => ({ ...prev, dueAt: e.target.value }))}
          />
        </label>
        <button data-testid="reminder-create" onClick={onCreateReminder}>
          Создать напоминание
        </button>
      </div>

      <ul style={{ marginTop: 12 }} data-testid="reminders-list">
        {reminders.map((item) => (
          <li key={item.id}>
            {item.title || 'Без названия'} — {item.type} — {new Date(item.due_at).toLocaleString()}
          </li>
        ))}
      </ul>
      <button data-testid="reminders-refresh" onClick={onRefreshReminders} style={{ marginTop: 8 }}>
        Обновить список
      </button>
    </section>
  )
}
