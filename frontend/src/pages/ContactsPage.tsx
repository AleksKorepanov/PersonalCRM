import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '../types'

type ContactsPageProps = {
  contacts: Contact[]
  contactsLoading: boolean
  contactError: string | null
  importStatus: string | null
  contactForm: { displayName: string; tieStrength: string; visibility: string; email: string }
  onContactFormChange: React.Dispatch<React.SetStateAction<{ displayName: string; tieStrength: string; visibility: string; email: string }>>
  onRefreshContacts: () => void
  onCreateContact: () => void
  onOpenContact: (contact: Contact) => void
  onImportContacts: (file: File) => void
  selectedContact?: Contact | null
}

export default function ContactsPage({
  contacts,
  contactsLoading,
  contactError,
  importStatus,
  contactForm,
  onContactFormChange,
  onRefreshContacts,
  onCreateContact,
  onOpenContact,
  onImportContacts,
  selectedContact,
}: ContactsPageProps) {
  const navigate = useNavigate()

  const handleOpen = (contact: Contact) => {
    onOpenContact(contact)
    navigate(`/contacts/${contact.id}/timeline`)
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2>Контакты</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3>Список</h3>
          {contactsLoading && <div>Загрузка…</div>}
          {contactError && <div style={{ color: '#b00020' }}>{contactError}</div>}
          {importStatus && <div style={{ color: '#2e7d32' }}>{importStatus}</div>}
          {!contactsLoading && contacts.length === 0 && <div>Пока нет контактов.</div>}
          <ul data-testid="contacts-list">
            {contacts.map((contact) => (
              <li key={contact.id} style={{ marginBottom: 8 }}>
                <button
                  data-testid={`contact-open-${contact.id}`}
                  onClick={() => handleOpen(contact)}
                  style={{ marginRight: 8 }}
                >
                  Открыть
                </button>
                {contact.display_name} ({contact.visibility})
              </li>
            ))}
          </ul>
          <button data-testid="contacts-refresh" onClick={onRefreshContacts}>
            Обновить список
          </button>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span style={{ display: 'inline-block', marginBottom: 6 }}>Импорт контактов</span>
            <input
              type="file"
              accept=".csv,.vcf,.vcard,.json"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  onImportContacts(file)
                }
                e.currentTarget.value = ''
              }}
            />
          </label>
        </div>
        <div>
          <h3>Создание</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              data-testid="contact-display-name"
              placeholder="Имя / отображаемое имя"
              value={contactForm.displayName}
              onChange={(e) => onContactFormChange((prev) => ({ ...prev, displayName: e.target.value }))}
            />
            <input
              data-testid="contact-email"
              placeholder="Email"
              value={contactForm.email}
              onChange={(e) => onContactFormChange((prev) => ({ ...prev, email: e.target.value }))}
            />
            <label>
              Близость:
              <select
                data-testid="contact-tie-strength"
                value={contactForm.tieStrength}
                onChange={(e) => onContactFormChange((prev) => ({ ...prev, tieStrength: e.target.value }))}
              >
                <option value="close">Близкий</option>
                <option value="medium">Средний</option>
                <option value="weak">Слабый</option>
              </select>
            </label>
            <label>
              Видимость:
              <select
                data-testid="contact-visibility"
                value={contactForm.visibility}
                onChange={(e) => onContactFormChange((prev) => ({ ...prev, visibility: e.target.value }))}
              >
                <option value="shared">Общая</option>
                <option value="limited">Ограниченная</option>
                <option value="private">Приватная</option>
              </select>
            </label>
            <button data-testid="contact-create" onClick={onCreateContact}>
              Создать контакт
            </button>
          </div>
        </div>
      </div>

      {selectedContact && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3>Просмотр</h3>
          <div>Имя: {selectedContact.display_name}</div>
          <div>Видимость: {selectedContact.visibility}</div>
          <div>Обновлено: {new Date(selectedContact.updated_at).toLocaleString()}</div>
        </div>
      )}
    </section>
  )
}
