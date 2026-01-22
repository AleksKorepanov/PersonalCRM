import React from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact } from '../types'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import { parseTierFromTags } from '../utils/cadence'

type ContactsPageProps = {
  contacts: Contact[]
  role: 'owner' | 'assistant'
  contactsLoading: boolean
  contactError: string | null
  importStatus: string | null
  contactForm: { displayName: string; tieStrength: string; visibility: string; email: string; phone: string }
  contactFormErrors: { displayName?: string; email?: string; phone?: string }
  searchQuery: string
  onContactFormChange: React.Dispatch<
    React.SetStateAction<{ displayName: string; tieStrength: string; visibility: string; email: string; phone: string }>
  >
  onRefreshContacts: () => void
  onCreateContact: () => void
  onOpenContact: (contact: Contact) => void
  onImportContacts: (file: File) => void
  selectedContact?: Contact | null
  submitError: string | null
  submitting: boolean
  isModalOpen: boolean
  onOpenModal: () => void
  onCloseModal: () => void
}

export default function ContactsPage({
  contacts,
  role,
  contactsLoading,
  contactError,
  importStatus,
  contactForm,
  contactFormErrors,
  searchQuery,
  onContactFormChange,
  onRefreshContacts,
  onCreateContact,
  onOpenContact,
  onImportContacts,
  selectedContact,
  submitError,
  submitting,
  isModalOpen,
  onOpenModal,
  onCloseModal,
}: ContactsPageProps) {
  const navigate = useNavigate()
  const visibleContacts = role === 'assistant' ? contacts.filter((contact) => contact.visibility !== 'private') : contacts
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredContacts = normalizedQuery
    ? visibleContacts.filter((contact) => contact.display_name.toLowerCase().includes(normalizedQuery))
    : visibleContacts

  const handleOpen = (contact: Contact) => {
    onOpenContact(contact)
    navigate(`/contacts/${contact.id}`)
  }

  const visibilityLabel = (value: Contact['visibility']) => {
    if (value === 'private') return t('contactsVisibilityPrivate')
    if (value === 'limited') return t('contactsVisibilityLimited')
    return t('contactsVisibilityShared')
  }

  const tierLabel = (contact: Contact) => {
    const tier = parseTierFromTags(contact.tags)
    if (tier === 'A') return t('contactTierA')
    if (tier === 'B') return t('contactTierB')
    if (tier === 'C') return t('contactTierC')
    return t('contactTierNone')
  }

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2>{t('pageContactsTitle')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#666' }}>
            {t('contactsCountLabel')}: {visibleContacts.length}
          </div>
          <Button onClick={onOpenModal}>{t('pageContactsCreate')}</Button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3>{t('contactsListTitle')}</h3>
          {contactsLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
          {contactError && visibleContacts.length === 0 && (
            <Alert type="error">
              {t('contactsLoadFailed')}
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" onClick={onRefreshContacts}>
                  {t('contactsRetry')}
                </Button>
              </div>
            </Alert>
          )}
          {importStatus && <Alert type="success">{importStatus}</Alert>}
          {!contactsLoading && visibleContacts.length === 0 && !contactError && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}>{t('contactsEmpty')}</div>
              <Button onClick={onOpenModal}>{t('contactsEmptyCta')}</Button>
            </div>
          )}
          {!contactsLoading && visibleContacts.length > 0 && filteredContacts.length === 0 && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>
              <div style={{ marginBottom: 6 }}>{t('contactsNotFound')}</div>
              <div style={{ color: '#666' }}>{t('contactsNotFoundHint')}</div>
            </div>
          )}
          <ul data-testid="contacts-list">
            {filteredContacts.map((contact) => (
              <li key={contact.id} style={{ marginBottom: 8 }}>
                <button
                  data-testid={`contact-open-${contact.id}`}
                  onClick={() => handleOpen(contact)}
                  style={{ marginRight: 8 }}
                >
                  {t('contactsOpen')}
                </button>
                {contact.display_name} ({visibilityLabel(contact.visibility)}) • {t('contactTierLabel')}: {tierLabel(contact)}
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={onRefreshContacts} dataTestId="contacts-refresh">
            {t('contactsRefresh')}
          </Button>
          <label style={{ display: 'block', marginTop: 12 }}>
            <span style={{ display: 'inline-block', marginBottom: 6 }}>{t('contactsImport')}</span>
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
          <h3>{t('contactsDetailsTitle')}</h3>
          {!selectedContact && <div>{t('contactsDetailsEmpty')}</div>}
          {selectedContact && (
            <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div>
                {t('contactsNameLabel')}: {selectedContact.display_name}
              </div>
              <div>
                {t('contactsVisibilityLabel')}: {visibilityLabel(selectedContact.visibility)}
              </div>
              <div>
                {t('contactTierLabel')}: {tierLabel(selectedContact)}
              </div>
              <div>
                {t('contactsUpdatedLabel')}: {new Date(selectedContact.updated_at).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
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
            }}
          >
            <h3 style={{ marginTop: 0 }}>{t('contactsModalTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <TextField
                label={t('contactsFieldNameLabel')}
                placeholder={t('contactsFieldNamePlaceholder')}
                value={contactForm.displayName}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, displayName: value }))}
                required
                error={contactFormErrors.displayName}
                dataTestId="contact-display-name"
              />
              <TextField
                label={t('contactsFieldEmailLabel')}
                placeholder={t('contactsFieldEmailPlaceholder')}
                value={contactForm.email}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, email: value }))}
                type="email"
                error={contactFormErrors.email}
                dataTestId="contact-email"
              />
              <TextField
                label={t('contactsFieldPhoneLabel')}
                placeholder={t('contactsFieldPhonePlaceholder')}
                value={contactForm.phone}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, phone: value }))}
                error={contactFormErrors.phone}
                dataTestId="contact-phone"
              />
              <Select
                label={t('contactsFieldTieLabel')}
                value={contactForm.tieStrength}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, tieStrength: value }))}
                options={[
                  { value: 'close', label: t('contactsTieClose') },
                  { value: 'medium', label: t('contactsTieMedium') },
                  { value: 'weak', label: t('contactsTieWeak') },
                ]}
                dataTestId="contact-tie-strength"
              />
              <Select
                label={t('contactsFieldVisibilityLabel')}
                value={contactForm.visibility}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, visibility: value }))}
                options={[
                  { value: 'shared', label: t('contactsVisibilityShared') },
                  { value: 'limited', label: t('contactsVisibilityLimited') },
                  { value: 'private', label: t('contactsVisibilityPrivate') },
                ]}
                dataTestId="contact-visibility"
              />
              {submitError && <Alert type="error">{submitError}</Alert>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={onCloseModal}>
                  {t('contactsCancel')}
                </Button>
                <Button
                  onClick={onCreateContact}
                  loading={submitting}
                  loadingLabel={t('contactsSavingLabel')}
                  dataTestId="contact-create"
                >
                  {t('contactsCreatedLabel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
