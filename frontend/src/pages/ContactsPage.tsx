import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Contact, ImportReport } from '../types'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import { parseTierFromTags } from '../utils/cadence'
import { useToast } from '../components/ui/Toast'

type ContactsPageProps = {
  contacts: Contact[]
  role: 'owner' | 'assistant'
  contactsLoading: boolean
  contactError: string | null
  contactForm: { displayName: string; tieStrength: string; visibility: string; email: string; phone: string }
  contactFormErrors: { displayName?: string; email?: string; phone?: string }
  searchQuery: string
  onContactFormChange: React.Dispatch<
    React.SetStateAction<{ displayName: string; tieStrength: string; visibility: string; email: string; phone: string }>
  >
  onRefreshContacts: () => void
  onCreateContact: () => void
  onOpenContact: (contact: Contact) => void
  onImportContacts: (file: File) => Promise<ImportReport>
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
  const toast = useToast()
  const lastSubmitErrorRef = useRef<string | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rows: string[][]; totalRows: number }>({
    headers: [],
    rows: [],
    totalRows: 0,
  })
  const [importReport, setImportReport] = useState<ImportReport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSubmitting, setImportSubmitting] = useState(false)
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

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const buildContactsCsv = (items: Contact[]) => {
    const header = ['name', 'email', 'phone', 'company', 'tags']
    const rows = items.map((contact) => {
      const name = contact.display_name || ''
      const email = (contact.emails || []).join(';')
      const phone = (contact.phones || []).join(';')
      const company = contact.organization?.name || contact.company_name || contact.company || ''
      const tags = (contact.tags || []).join(';')
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
      return [name, email, phone, company, tags].map(escape).join(',')
    })
    return [header.join(','), ...rows].join('\n')
  }

  const handleExportContactsCsv = () => {
    const csv = buildContactsCsv(visibleContacts)
    downloadFile(csv, 'contacts.csv', 'text/csv;charset=utf-8')
  }

  const handleExportContactsJson = () => {
    const payload = visibleContacts.map((contact) => ({
      name: contact.display_name,
      email: contact.emails || [],
      phone: contact.phones || [],
      company: contact.organization?.name || contact.company_name || contact.company || null,
      tags: contact.tags || [],
    }))
    downloadFile(JSON.stringify(payload, null, 2), 'contacts.json', 'application/json;charset=utf-8')
  }

  const tierLabel = (contact: Contact) => {
    const tier = parseTierFromTags(contact.tags)
    if (tier === 'A') return t('contactTierA')
    if (tier === 'B') return t('contactTierB')
    if (tier === 'C') return t('contactTierC')
    return t('contactTierNone')
  }

  useEffect(() => {
    if (submitError && submitError !== lastSubmitErrorRef.current) {
      toast.error(t('toastActionFailed'))
      lastSubmitErrorRef.current = submitError
    }
  }, [submitError, toast])

  const detectDelimiter = (headerLine: string) => {
    const commaCount = headerLine.split(',').length - 1
    const semiCount = headerLine.split(';').length - 1
    return semiCount > commaCount ? ';' : ','
  }

  const parseCsvPreview = (text: string) => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) {
      return { headers: [], rows: [], totalRows: 0 }
    }
    const delimiter = detectDelimiter(lines[0])
    const parseLine = (line: string) => {
      const cells: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i += 1
            continue
          }
          inQuotes = !inQuotes
          continue
        }
        if (char === delimiter && !inQuotes) {
          cells.push(current.trim())
          current = ''
          continue
        }
        current += char
      }
      cells.push(current.trim())
      return cells
    }
    const headers = parseLine(lines[0])
    const dataLines = lines.slice(1)
    const rows = dataLines.slice(0, 20).map(parseLine)
    const normalizedRows = rows.map((row) => {
      const padded = [...row]
      while (padded.length < headers.length) {
        padded.push('')
      }
      return padded.slice(0, headers.length)
    })
    return { headers, rows: normalizedRows, totalRows: dataLines.length }
  }

  const handleImportFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportFile(null)
      setImportPreview({ headers: [], rows: [], totalRows: 0 })
      setImportReport(null)
      setImportError(t('contactsImportInvalidFile'))
      return
    }
    setImportFile(file)
    setImportReport(null)
    setImportError(null)
    try {
      const text = await file.text()
      const preview = parseCsvPreview(text)
      setImportPreview(preview)
    } catch (error) {
      setImportPreview({ headers: [], rows: [], totalRows: 0 })
      setImportError((error as Error).message || t('contactsImportFileReadFailed'))
    }
  }

  const handleImportSubmit = async () => {
    if (!importFile || importSubmitting) return
    setImportSubmitting(true)
    setImportError(null)
    setImportReport(null)
    try {
      const report = await onImportContacts(importFile)
      setImportReport(report)
      toast.success(t('toastSaved'))
    } catch (error) {
      setImportError((error as Error).message || t('contactsImportFailed'))
    } finally {
      setImportSubmitting(false)
    }
  }

  const importErrorsList = importReport?.errors ?? []

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2>{t('pageContactsTitle')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#666' }}>
            {t('contactsCountLabel')}: {visibleContacts.length}
          </div>
          <Button variant="secondary" onClick={handleExportContactsCsv}>
            {t('contactsExportCsv')}
          </Button>
          <Button variant="secondary" onClick={handleExportContactsJson}>
            {t('contactsExportJson')}
          </Button>
          <Button variant="secondary" onClick={() => setImportModalOpen(true)} dataTestId="contacts-import-open">
            {t('contactsImportButton')}
          </Button>
          <Button onClick={onOpenModal} dataTestId="contact-create">
            {t('pageContactsCreate')}
          </Button>
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
              <li key={contact.id} style={{ marginBottom: 8 }} data-testid={`contact-row-${contact.id}`}>
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
          data-testid="contacts-import-modal"
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
                dataTestId="contact-form-name"
              />
              <TextField
                label={t('contactsFieldEmailLabel')}
                placeholder={t('contactsFieldEmailPlaceholder')}
                value={contactForm.email}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, email: value }))}
                type="email"
                error={contactFormErrors.email}
                dataTestId="contact-form-email"
              />
              <TextField
                label={t('contactsFieldPhoneLabel')}
                placeholder={t('contactsFieldPhonePlaceholder')}
                value={contactForm.phone}
                onChange={(value) => onContactFormChange((prev) => ({ ...prev, phone: value }))}
                error={contactFormErrors.phone}
                dataTestId="contact-form-phone"
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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={onCloseModal} dataTestId="contact-cancel">
                  {t('contactsCancel')}
                </Button>
                <Button
                  onClick={onCreateContact}
                  loading={submitting}
                  loadingLabel={t('contactsSavingLabel')}
                  dataTestId="contact-save"
                >
                  {t('contactsCreatedLabel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
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
              maxWidth: 720,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{t('contactsImportTitle')}</h3>
              <Button
                variant="secondary"
                onClick={() => {
                  setImportModalOpen(false)
                  setImportFile(null)
                  setImportPreview({ headers: [], rows: [], totalRows: 0 })
                  setImportReport(null)
                  setImportError(null)
                }}
                dataTestId="contacts-import-close"
              >
                {t('contactsImportClose')}
              </Button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>{t('contactsImportChooseFile')}</div>
                <input
                  type="file"
                  accept=".csv"
                  data-testid="contacts-import-file"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      handleImportFile(file)
                    } else {
                      setImportFile(null)
                      setImportPreview({ headers: [], rows: [], totalRows: 0 })
                    }
                    event.currentTarget.value = ''
                  }}
                />
              </div>

              {importError && (
                <Alert type="error" dataTestId="contacts-import-error">
                  {importError}
                </Alert>
              )}

              {importPreview.headers.length > 0 && (
                <div>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>
                    {t('contactsImportPreviewTitle')} ({t('contactsImportPreviewRows')}: {Math.min(20, importPreview.totalRows)}
                    {importPreview.totalRows > 20 ? ` / ${importPreview.totalRows}` : ''})
                  </div>
                  <div
                    style={{
                      border: '1px solid #e6e6e6',
                      borderRadius: 8,
                      overflowX: 'auto',
                      maxHeight: 280,
                      overflowY: 'auto',
                    }}
                    data-testid="contacts-import-preview"
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead style={{ background: '#f7f7f7' }}>
                        <tr>
                          {importPreview.headers.map((header, idx) => (
                            <th key={idx} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e6e6e6' }}>
                              {header || t('contactsImportEmptyHeader')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
                                {cell || t('emptyValue')}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {importPreview.rows.length === 0 && (
                          <tr>
                            <td colSpan={importPreview.headers.length || 1} style={{ padding: '8px', color: '#666' }}>
                              {t('contactsImportPreviewEmpty')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#666' }}>{t('contactsImportHint')}</div>
                <Button
                  onClick={handleImportSubmit}
                  loading={importSubmitting}
                  disabled={!importFile || importSubmitting}
                  dataTestId="contacts-import-submit"
                >
                  {t('contactsImportSubmit')}
                </Button>
              </div>

              {importReport && (
                <div data-testid="contacts-import-report">
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('contactsImportReportTitle')}</div>
                  <div style={{ marginBottom: 8 }}>
                    {t('contactsImportImported')}: {importReport.imported}, {t('contactsImportSkipped')}: {importReport.skipped}
                  </div>
                  {importErrorsList.length > 0 ? (
                    <div>
                      <div style={{ marginBottom: 6 }}>{t('contactsImportErrorsTitle')}</div>
                      <ul data-testid="contacts-import-errors">
                        {importErrorsList.map((item, idx) => (
                          <li key={`${item.line}-${idx}`}>
                            {t('contactsImportLine')} {item.line}: {item.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ color: '#2a7' }}>{t('contactsImportNoErrors')}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
