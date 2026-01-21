import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Contact, Interaction } from '../types'

type TimelinePageProps = {
  selectedContact: Contact | null
  onSelectContact: (contactId: string) => Promise<Contact | null>
  interactions: Interaction[]
  interactionForm: { type: string; occurredAt: string; summary: string }
  onInteractionFormChange: React.Dispatch<React.SetStateAction<{ type: string; occurredAt: string; summary: string }>>
  onCreateInteraction: (contactId: string) => void
  timelineError: string | null
}

export default function TimelinePage({
  selectedContact,
  onSelectContact,
  interactions,
  interactionForm,
  onInteractionFormChange,
  onCreateInteraction,
  timelineError,
}: TimelinePageProps) {
  const { contactId } = useParams()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contactId) return
    setLoading(true)
    onSelectContact(contactId).finally(() => setLoading(false))
  }, [contactId, onSelectContact])

  if (!contactId) {
    return <div>Сначала выберите контакт.</div>
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2>Таймлайн контакта</h2>
      {loading && <div>Загрузка…</div>}
      {!loading && !selectedContact && <div>Контакт не найден.</div>}
      {selectedContact && (
        <>
          <div style={{ marginBottom: 12 }}>Контакт: {selectedContact.display_name}</div>
          {timelineError && <div style={{ color: '#b00020' }}>{timelineError}</div>}
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <label>
              Тип:
              <select
                data-testid="interaction-type"
                value={interactionForm.type}
                onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="meeting">Встреча</option>
                <option value="call">Звонок</option>
                <option value="message">Сообщение</option>
                <option value="event">Событие</option>
                <option value="intro">Интродукция</option>
                <option value="help_given">Помощь оказана</option>
                <option value="help_received">Помощь получена</option>
                <option value="note">Заметка</option>
              </select>
            </label>
            <label>
              Дата и время:
              <input
                data-testid="interaction-occurred-at"
                value={interactionForm.occurredAt}
                onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, occurredAt: e.target.value }))}
              />
            </label>
            <input
              data-testid="interaction-summary"
              placeholder="Краткое описание"
              value={interactionForm.summary}
              onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, summary: e.target.value }))}
            />
            <button data-testid="interaction-create" onClick={() => onCreateInteraction(selectedContact.id)}>
              Добавить взаимодействие
            </button>
          </div>
          <ul data-testid="timeline-list">
            {interactions.map((item) => (
              <li key={item.id} data-testid="timeline-item">
                {new Date(item.occurred_at).toLocaleString()} — {item.type} {item.summary ? `: ${item.summary}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
