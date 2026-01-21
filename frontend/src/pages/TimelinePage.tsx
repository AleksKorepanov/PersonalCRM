import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Contact, Interaction } from '../types'
import { t } from '../i18n/t'

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
    return <div>{t('timelineSelectContact')}</div>
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2>{t('timelineTitle')}</h2>
      {loading && <div>{t('contactsLoading')}</div>}
      {!loading && !selectedContact && <div>{t('timelineContactMissing')}</div>}
      {selectedContact && (
        <>
          <div style={{ marginBottom: 12 }}>
            {t('timelineContactLabel')}: {selectedContact.display_name}
          </div>
          {timelineError && <div style={{ color: '#b00020' }}>{timelineError}</div>}
          <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
            <label>
              {t('timelineTypeLabel')}:
              <select
                data-testid="interaction-type"
                value={interactionForm.type}
                onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="meeting">{t('timelineTypeMeeting')}</option>
                <option value="call">{t('timelineTypeCall')}</option>
                <option value="message">{t('timelineTypeMessage')}</option>
                <option value="event">{t('timelineTypeEvent')}</option>
                <option value="intro">{t('timelineTypeIntro')}</option>
                <option value="help_given">{t('timelineTypeHelpGiven')}</option>
                <option value="help_received">{t('timelineTypeHelpReceived')}</option>
                <option value="note">{t('timelineTypeNote')}</option>
              </select>
            </label>
            <label>
              {t('timelineDateLabel')}:
              <input
                data-testid="interaction-occurred-at"
                value={interactionForm.occurredAt}
                onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, occurredAt: e.target.value }))}
              />
            </label>
            <input
              data-testid="interaction-summary"
              placeholder={t('timelineSummaryPlaceholder')}
              value={interactionForm.summary}
              onChange={(e) => onInteractionFormChange((prev) => ({ ...prev, summary: e.target.value }))}
            />
            <button data-testid="interaction-create" onClick={() => onCreateInteraction(selectedContact.id)}>
              {t('timelineAddButton')}
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
