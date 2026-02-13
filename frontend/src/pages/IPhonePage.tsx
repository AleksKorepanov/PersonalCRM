import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import TextField from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { ApiRequestOptions } from '../types'

type IPhonePageProps = {
  apiRequest: <T>(path: string, options?: ApiRequestOptions) => Promise<T>
  workspaceId: string | null
  apiBase?: string
}

type ICloudAccount = {
  id: string
  workspace_id: string
  apple_id: string
  sync_enabled: boolean
  last_sync_at: string | null
  sync_error: string | null
  created_at: string
  updated_at: string
}

type ICloudContactPhone = {
  label?: string | null
  value: string
  is_primary?: boolean | null
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
  } | null
  company: string | null
  job_title: string | null
  department: string | null
  phones: ICloudContactPhone[]
  emails: Array<{ label?: string | null; value: string; is_primary?: boolean | null }>
  synced_at: string
  link: {
    id: string
    crm_contact_id: string
    link_type: string
    link_status: string
  } | null
  created_at: string
  updated_at: string
}

export default function IPhonePage({ apiRequest, workspaceId, apiBase }: IPhonePageProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [account, setAccount] = useState<ICloudAccount | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [contacts, setContacts] = useState<ICloudContact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [checkingBackend, setCheckingBackend] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!workspaceId) {
      setError(null)
      setAccount(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const status = await apiRequest<ICloudAccount>('/api/v1/icloud/status', {
        params: { workspace_id: workspaceId },
      })
      setAccount(status)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isNetworkError = 
        err instanceof TypeError || 
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed')
      
      // 404 означает, что аккаунт не подключен - это нормально
      // Сетевые ошибки означают, что бэкенд недоступен
      if (isNetworkError) {
        const backendUrl = apiBase || 'http://localhost:8000'
        setError(`${t('iphoneBackendError')} URL бэкенда: ${backendUrl}. Проверьте, что бэкенд запущен и доступен.`)
      } else if (!errorMessage.includes('404') && !errorMessage.includes('NOT_FOUND')) {
        setError(errorMessage)
      } else {
        setAccount(null)
      }
    } finally {
      setLoading(false)
    }
  }, [apiRequest, workspaceId, t])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  const loadContacts = useCallback(async () => {
    if (!workspaceId || !account) return
    setContactsLoading(true)
    setContactsError(null)
    try {
      const params: Record<string, string> = { limit: '200' }
      if (debouncedSearch.trim()) {
        params.q = debouncedSearch.trim()
      }
      const res = await apiRequest<{ data: ICloudContact[] }>('/api/v1/icloud/contacts', {
        params: { workspace_id: workspaceId, ...params },
      })
      setContacts(res.data || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isNetworkError = 
        err instanceof TypeError || 
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed')
      
      // 404 означает, что аккаунт не подключен - это нормально
      // Сетевые ошибки означают, что бэкенд недоступен
      if (isNetworkError) {
        const backendUrl = apiBase || 'http://localhost:8000'
        setContactsError(`${t('iphoneBackendError')} URL бэкенда: ${backendUrl}.`)
      } else if (!errorMessage.includes('404') && !errorMessage.includes('NOT_FOUND')) {
        setContactsError(errorMessage)
      } else {
        setContacts([])
      }
    } finally {
      setContactsLoading(false)
    }
  }, [apiRequest, workspaceId, account, debouncedSearch, t, apiBase])

  useEffect(() => {
    if (account) {
      loadContacts()
    } else {
      setContacts([])
    }
  }, [account, loadContacts])

  const filteredContacts = useMemo(() => {
    if (!debouncedSearch.trim()) return contacts
    const query = debouncedSearch.trim().toLowerCase()
    return contacts.filter((contact) => {
      const displayName = contact.display_name?.toLowerCase() || ''
      const company = contact.company?.toLowerCase() || ''
      const phones = contact.phones.map((p) => p.value.toLowerCase()).join(' ')
      return displayName.includes(query) || company.includes(query) || phones.includes(query)
    })
  }, [contacts, debouncedSearch])

  const formatPhone = (phones: ICloudContactPhone[]) => {
    if (phones.length === 0) return t('emptyValue')
    return phones.map((p) => p.value).join(', ')
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


  const handleSync = async () => {
    if (!workspaceId) {
      const msg = t('workspaceMissing') || 'Рабочее пространство не выбрано'
      setError(msg)
      toast.error(msg)
      return
    }

    setSyncing(true)
    setError(null)
    try {
      const result = await apiRequest<{ status: string; synced_count: number }>('/api/v1/icloud/sync', {
        method: 'POST',
        params: { workspace_id: workspaceId },
      })
      await loadStatus()
      await loadContacts()
      toast.success(t('icloudSyncSuccess').replace('{count}', String(result.synced_count)))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isNetworkError = 
        err instanceof TypeError || 
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed')
      
      if (isNetworkError) {
        const backendUrl = apiBase || 'http://localhost:8000'
        const networkErrorMsg = `${t('iphoneBackendError')} URL бэкенда: ${backendUrl}.`
        setError(networkErrorMsg)
        toast.error(networkErrorMsg)
      } else {
        setError(errorMessage)
        toast.error(errorMessage)
      }
    } finally {
      setSyncing(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('icloudNeverSynced')
    try {
      const date = new Date(dateString)
      return new Intl.DateTimeFormat('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    } catch {
      return dateString
    }
  }

  const checkBackendHealth = async () => {
    if (!apiBase) return
    setCheckingBackend(true)
    try {
      const healthUrl = `${apiBase}/health`
      const response = await fetch(healthUrl, { method: 'GET' })
      if (response.ok) {
        const data = await response.json()
        toast.success(`Бэкенд доступен. Статус: ${data.status || 'ok'}`)
      } else {
        toast.error(`Бэкенд отвечает с ошибкой: ${response.status}`)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(`Не удалось подключиться к бэкенду: ${errorMessage}`)
    } finally {
      setCheckingBackend(false)
    }
  }

  return (
    <div data-testid="iphone-page" style={{ marginTop: 'var(--space-3)' }}>
      <SectionHeader title={t('menuIPhone')} />

      {!workspaceId && (
        <Alert type="info" style={{ marginTop: 'var(--space-4)' }}>
          {t('workspaceMissing') || 'Рабочее пространство не выбрано'}
        </Alert>
      )}

      {loading && <Alert type="info">{t('contactsLoading')}</Alert>}
      {error && (
        <Alert type="error">
          <div style={{ marginBottom: 'var(--space-2)' }}>{error}</div>
          {apiBase && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                onClick={checkBackendHealth}
                loading={checkingBackend}
                dataTestId="check-backend-health"
              >
                Проверить доступность бэкенда
              </Button>
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
                <div>Для запуска бэкенда выполните:</div>
                <code style={{ display: 'block', marginTop: 'var(--space-1)', padding: 'var(--space-2)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                  docker compose up -d backend
                </code>
                <div style={{ marginTop: 'var(--space-2)' }}>или</div>
                <code style={{ display: 'block', marginTop: 'var(--space-1)', padding: 'var(--space-2)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)' }}>
                  cd backend && python -m uvicorn app.main:app --reload --port 8000
                </code>
              </div>
            </div>
          )}
        </Alert>
      )}

      {!workspaceId ? null : !account ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Alert type="info">
            {t('iphoneNotConnectedMessage')}
          </Alert>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button onClick={() => navigate('/settings')} dataTestId="iphone-go-to-settings">
              {t('iphoneGoToSettings')}
            </Button>
          </div>
        </div>
      ) : (
        <div data-testid="icloud-status" style={{ maxWidth: 600, marginTop: 'var(--space-4)' }}>
          <div
            style={{
              padding: 'var(--space-4)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface)',
            }}
          >
            <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-3)' }}>{t('icloudStatusTitle')}</h2>

            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                  {t('icloudAppleIdLabel')}
                </div>
                <div style={{ fontSize: 'var(--font-md)' }}>{account.apple_id}</div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                  {t('icloudSyncStatusLabel')}
                </div>
                <div style={{ fontSize: 'var(--font-md)' }}>
                  {account.sync_enabled ? t('icloudSyncEnabled') : t('icloudSyncDisabled')}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                  {t('icloudLastSyncLabel')}
                </div>
                <div style={{ fontSize: 'var(--font-md)' }}>{formatDate(account.last_sync_at)}</div>
              </div>

              {account.sync_error && (
                <Alert type="error">
                  <div style={{ fontSize: 'var(--font-sm)' }}>
                    <strong>{t('icloudSyncErrorLabel')}:</strong> {account.sync_error}
                  </div>
                </Alert>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button onClick={handleSync} loading={syncing} dataTestId="icloud-sync-button">
                  {t('icloudSyncButton')}
                </Button>
              </div>
            </div>
          </div>

          {/* Таблица контактов */}
          <div style={{ marginTop: 'var(--space-6)' }}>
            <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-3)' }}>{t('icloudContactsTitle')}</h2>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <TextField
                label={t('icloudContactsSearchLabel')}
                placeholder={t('icloudContactsSearchPlaceholder')}
                value={searchQuery}
                onChange={setSearchQuery}
                dataTestId="iphone-search"
              />
            </div>

            {contactsLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
            {contactsError && (
              <Alert type="error">
                <div>{t('icloudContactsLoadFailed')}</div>
                {contactsError !== t('iphoneBackendError') && (
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
                    {contactsError}
                  </div>
                )}
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button variant="secondary" onClick={loadContacts}>
                    {t('contactsRetry')}
                  </Button>
                </div>
              </Alert>
            )}

            {!contactsLoading && !contactsError && filteredContacts.length === 0 && contacts.length === 0 && (
              <div
                style={{
                  padding: 'var(--space-6)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  textAlign: 'center',
                  color: 'var(--color-muted)',
                }}
              >
                <div style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-2)' }}>
                  {t('icloudContactsEmpty')}
                </div>
                <div style={{ fontSize: 'var(--font-sm)' }}>{t('icloudContactsEmptyHint')}</div>
              </div>
            )}

            {!contactsLoading && !contactsError && filteredContacts.length === 0 && contacts.length > 0 && (
              <div
                style={{
                  padding: 'var(--space-6)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  textAlign: 'center',
                  color: 'var(--color-muted)',
                }}
              >
                <div style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-2)' }}>
                  {t('contactsNotFound')}
                </div>
                <div style={{ fontSize: 'var(--font-sm)' }}>{t('contactsNotFoundHint')}</div>
              </div>
            )}

            {filteredContacts.length > 0 && (
              <div
                data-testid="iphone-contacts-table"
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>{t('icloudContactsTableName')}</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>{t('icloudContactsTablePhone')}</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>{t('icloudContactsTableCompany')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((contact) => (
                      <tr
                        key={contact.id}
                        data-testid={`iphone-row-${contact.id}`}
                        onClick={() => navigate(`/iphone/contacts/${contact.id}`)}
                        style={{
                          cursor: 'pointer',
                          borderTop: '1px solid #e5e7eb',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f9fafb'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 12px' }}>{formatDisplayName(contact)}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--color-muted)' }}>{formatPhone(contact.phones)}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--color-muted)' }}>
                          {contact.company || t('emptyValue')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
