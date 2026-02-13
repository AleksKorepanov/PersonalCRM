import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { ApiRequestOptions, Contact } from '../types'

type ICloudContactPageProps = {
  apiRequest: <T>(path: string, options?: ApiRequestOptions) => Promise<T>
  workspaceId: string | null
  loadContact: (contactId: string) => Promise<Contact | null>
  onCreateContact: (payload: {
    display_name: string
    phones?: string[]
    emails?: string[]
    company?: string
    job_title?: string
    tie_strength: string
    visibility: string
  }) => Promise<Contact>
}

type ICloudContactPhone = {
  label?: string | null
  value: string
  is_primary?: boolean | null
}

type ICloudContactEmail = {
  label?: string | null
  value: string
  is_primary?: boolean | null
}

type ICloudContactAddress = {
  label?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
}

type ICloudContactUrl = {
  label?: string | null
  value: string
}

type ICloudContactIM = {
  label?: string | null
  service?: string | null
  username?: string | null
}

type ICloudContactDate = {
  label?: string | null
  date: string
}

type ICloudContactLink = {
  id: string
  crm_contact_id: string
  link_type: string
  link_status: string
  matched_phone_norm?: string | null
}

type ICloudContact = {
  id: string
  workspace_id: string
  remote_uri: string
  etag: string
  display_name: string | null
  structured_name: {
    given_name?: string | null
    middle_name?: string | null
    family_name?: string | null
    prefix?: string | null
    suffix?: string | null
  } | null
  company: string | null
  job_title: string | null
  department: string | null
  phones: ICloudContactPhone[]
  emails: ICloudContactEmail[]
  addresses: ICloudContactAddress[]
  urls: ICloudContactUrl[]
  ims: ICloudContactIM[]
  dates: ICloudContactDate[]
  notes: string | null
  synced_at: string
  link: ICloudContactLink | null
  created_at: string
  updated_at: string
}

export default function ICloudContactPage({
  apiRequest,
  workspaceId,
  loadContact,
  onCreateContact,
}: ICloudContactPageProps) {
  const navigate = useNavigate()
  const { contactId } = useParams()
  const toast = useToast()
  const [contact, setContact] = useState<ICloudContact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [matchingContacts, setMatchingContacts] = useState<Contact[]>([])
  const [checkingMatch, setCheckingMatch] = useState(false)

  const loadICloudContact = useCallback(async () => {
    if (!workspaceId || !contactId) return
    setLoading(true)
    setError(null)
    try {
      // workspace_id добавляется автоматически в apiRequest, не нужно передавать в params
      const data = await apiRequest<ICloudContact>(`/api/v1/icloud/contacts/${contactId}`)
      setContact(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
      console.error('Failed to load iCloud contact:', err)
      // Если контакт не найден, это нормально - просто показываем сообщение
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND') || errorMessage.includes('не найден')) {
        setError(t('icloudContactNotFound'))
      }
    } finally {
      setLoading(false)
    }
  }, [apiRequest, workspaceId, contactId])

  useEffect(() => {
    loadICloudContact()
  }, [loadICloudContact])

  // Проверяем совпадения по телефону
  useEffect(() => {
    if (!contact || contact.link || !workspaceId) {
      setMatchingContacts([])
      return
    }

    const checkMatches = async () => {
      if (contact.phones.length === 0) {
        setMatchingContacts([])
        return
      }

      setCheckingMatch(true)
      try {
        // Получаем все CRM контакты и проверяем совпадения по телефону
        const crmContacts = await apiRequest<{ data: Contact[] }>('/api/v1/contacts', {
          params: { workspace_id: workspaceId, limit: '200' },
        })

        // Нормализуем телефоны iCloud контакта
        const icloudPhonesNorm = contact.phones
          .map((p) => {
            try {
              // Используем нормализацию телефона (упрощенная версия)
              const cleaned = p.value.replace(/\D/g, '')
              return cleaned.length >= 10 ? cleaned.slice(-10) : null
            } catch {
              return null
            }
          })
          .filter(Boolean) as string[]

        const matches = (crmContacts.data || []).filter((crmContact) => {
          return crmContact.phones.some((phone) => {
            try {
              const cleaned = phone.replace(/\D/g, '')
              const normalized = cleaned.length >= 10 ? cleaned.slice(-10) : cleaned
              return icloudPhonesNorm.some((icloudPhone) => normalized === icloudPhone || normalized.includes(icloudPhone) || icloudPhone.includes(normalized))
            } catch {
              return false
            }
          })
        })

        setMatchingContacts(matches)
      } catch (err) {
        // Игнорируем ошибки при проверке совпадений
        setMatchingContacts([])
      } finally {
        setCheckingMatch(false)
      }
    }

    checkMatches()
  }, [contact, workspaceId, apiRequest])

  const handleLinkByPhone = async () => {
    if (!workspaceId || !contactId || matchingContacts.length !== 1) return

    setLinking(true)
    try {
      await apiRequest(`/api/v1/icloud/contacts/${contactId}/link`, {
        method: 'POST',
        params: { workspace_id: workspaceId },
        body: {
          crm_contact_id: matchingContacts[0].id,
          link_type: 'phone_match',
        },
      })
      await loadICloudContact()
      toast.success(t('icloudContactLinkedSuccess'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(errorMessage)
    } finally {
      setLinking(false)
    }
  }

  const handleCreateFromICloud = async () => {
    if (!workspaceId || !contact) return

    setCreating(true)
    try {
      const payload = {
        display_name: contact.display_name || 'Без имени',
        phones: contact.phones.map((p) => p.value),
        emails: contact.emails.map((e) => e.value),
        company: contact.company || undefined,
        job_title: contact.job_title || undefined,
        tie_strength: 'medium',
        visibility: 'shared',
      }

      const created = await onCreateContact(payload)

      // Связываем созданный контакт с iCloud контактом
      await apiRequest(`/api/v1/icloud/contacts/${contactId}/link`, {
        method: 'POST',
        params: { workspace_id: workspaceId },
        body: {
          crm_contact_id: created.id,
          link_type: 'manual',
        },
      })

      await loadICloudContact()
      toast.success(t('icloudContactCreatedAndLinkedSuccess'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(errorMessage)
    } finally {
      setCreating(false)
    }
  }

  const formatDisplayName = (contact: ICloudContact) => {
    if (contact.display_name) return contact.display_name
    const name = contact.structured_name
    if (name) {
      const parts = [name.given_name, name.middle_name, name.family_name].filter(Boolean)
      return parts.length > 0 ? parts.join(' ') : t('emptyValue')
    }
    return t('emptyValue')
  }

  const formatAddress = (addr: ICloudContactAddress) => {
    const parts = [addr.street, addr.city, addr.region, addr.postal_code, addr.country].filter(Boolean)
    return parts.join(', ') || t('emptyValue')
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return new Intl.DateTimeFormat('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date)
    } catch {
      return dateStr
    }
  }

  if (loading) {
    return (
      <div style={{ marginTop: 'var(--space-3)' }}>
        <SectionHeader title={t('icloudContactDetails')} />
        <Alert type="info">{t('contactsLoading')}</Alert>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div style={{ marginTop: 'var(--space-3)' }}>
        <SectionHeader title={t('icloudContactDetails')} />
        <Alert type="error">{error || t('icloudContactNotFound')}</Alert>
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button onClick={() => navigate('/iphone')} variant="secondary">
            {t('icloudBackToList')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Button onClick={() => navigate('/iphone')} variant="secondary">
          ← {t('icloudBackToList')}
        </Button>
      </div>

      <SectionHeader title={formatDisplayName(contact)} />

      {/* Блок связи с CRM контактом */}
      <div
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-4)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface)',
        }}
      >
        <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-3)' }}>
          {t('icloudContactLinkTitle')}
        </h3>

        {contact.link ? (
          <div>
            <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-muted)' }}>
              {t('icloudContactLinked')} ({t('icloudContactLinkType')}: {contact.link.link_type})
            </div>
            <Button
              onClick={() => navigate(`/contacts/${contact.link!.crm_contact_id}`)}
              dataTestId="icloud-open-crm-contact"
            >
              {t('icloudOpenCrmContact')}
            </Button>
          </div>
        ) : matchingContacts.length === 1 ? (
          <div>
            <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-muted)' }}>
              {t('icloudContactPhoneMatchFound')}: {matchingContacts[0].display_name}
            </div>
            <Button
              onClick={handleLinkByPhone}
              loading={linking}
              dataTestId="icloud-link-by-phone"
            >
              {t('icloudLinkByPhone')}
            </Button>
          </div>
        ) : matchingContacts.length > 1 ? (
          <div>
            <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-muted)' }}>
              {t('icloudContactMultipleMatches')} ({matchingContacts.length})
            </div>
            <div style={{ fontSize: 'var(--font-sm)', marginBottom: 'var(--space-2)' }}>
              {matchingContacts.map((c) => c.display_name).join(', ')}
            </div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
              {t('icloudContactManualLinkHint')}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 'var(--space-2)', color: 'var(--color-muted)' }}>
              {t('icloudContactNoMatch')}
            </div>
            <Button
              onClick={handleCreateFromICloud}
              loading={creating}
              dataTestId="icloud-create-from-icloud"
            >
              {t('icloudCreateFromICloud')}
            </Button>
          </div>
        )}
      </div>

      {/* Секции контакта */}
      <div style={{ marginTop: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
        {/* Имя */}
        {(contact.display_name || contact.structured_name) && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionName')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              {contact.structured_name && (
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  {contact.structured_name.prefix && (
                    <div>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactPrefix')}: </span>
                      {contact.structured_name.prefix}
                    </div>
                  )}
                  {contact.structured_name.given_name && (
                    <div>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactGivenName')}: </span>
                      {contact.structured_name.given_name}
                    </div>
                  )}
                  {contact.structured_name.middle_name && (
                    <div>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactMiddleName')}: </span>
                      {contact.structured_name.middle_name}
                    </div>
                  )}
                  {contact.structured_name.family_name && (
                    <div>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactFamilyName')}: </span>
                      {contact.structured_name.family_name}
                    </div>
                  )}
                  {contact.structured_name.suffix && (
                    <div>
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactSuffix')}: </span>
                      {contact.structured_name.suffix}
                    </div>
                  )}
                </div>
              )}
              {contact.display_name && !contact.structured_name && (
                <div>{contact.display_name}</div>
              )}
            </div>
          </div>
        )}

        {/* Компания */}
        {(contact.company || contact.job_title || contact.department) && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionCompany')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.company && (
                  <div>
                    <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('contactCompanyLabel')}: </span>
                    {contact.company}
                  </div>
                )}
                {contact.job_title && (
                  <div>
                    <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('contactJobTitleLabel')}: </span>
                    {contact.job_title}
                  </div>
                )}
                {contact.department && (
                  <div>
                    <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('icloudContactDepartment')}: </span>
                    {contact.department}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Телефоны */}
        {contact.phones.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('contactPhonesLabel')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.phones.map((phone, idx) => (
                  <div key={idx}>
                    {phone.label && (
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{phone.label}: </span>
                    )}
                    {phone.value}
                    {phone.is_primary && (
                      <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
                        ({t('icloudContactPrimary')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Email */}
        {contact.emails.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('contactEmailsLabel')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.emails.map((email, idx) => (
                  <div key={idx}>
                    {email.label && (
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{email.label}: </span>
                    )}
                    <a href={`mailto:${email.value}`} style={{ color: 'var(--color-primary)' }}>
                      {email.value}
                    </a>
                    {email.is_primary && (
                      <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
                        ({t('icloudContactPrimary')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Адреса */}
        {contact.addresses.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionAddresses')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {contact.addresses.map((addr, idx) => (
                  <div key={idx}>
                    {addr.label && (
                      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                        {addr.label}
                      </div>
                    )}
                    <div>{formatAddress(addr)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* URL */}
        {contact.urls.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionUrls')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.urls.map((url, idx) => (
                  <div key={idx}>
                    {url.label && (
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{url.label}: </span>
                    )}
                    <a href={url.value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
                      {url.value}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Мессенджеры */}
        {contact.ims.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionMessengers')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.ims.map((im, idx) => (
                  <div key={idx}>
                    {im.service && (
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{im.service}: </span>
                    )}
                    {im.username || im.label || t('emptyValue')}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Даты */}
        {contact.dates.length > 0 && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionDates')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {contact.dates.map((date, idx) => (
                  <div key={idx}>
                    {date.label && (
                      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{date.label}: </span>
                    )}
                    {formatDate(date.date)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Заметки */}
        {contact.notes && (
          <div>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-2)' }}>{t('icloudContactSectionNotes')}</h3>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{contact.notes}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
