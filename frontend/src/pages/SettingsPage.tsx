import React, { useState, useCallback, useEffect } from 'react'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import TextField from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { ApiRequestOptions } from '../types'

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

type SettingsPageProps = {
  apiRequest: <T>(path: string, options?: ApiRequestOptions) => Promise<T>
  workspaceId: string | null
  role: 'owner' | 'assistant' | 'collaborator'
  userEmail: string | null
}

type WorkspaceMember = {
  id: string
  email: string
  display_name: string | null
  role: string
  is_active: boolean
}

export default function SettingsPage({ apiRequest, workspaceId, role, userEmail }: SettingsPageProps) {
  const toast = useToast()
  const [account, setAccount] = useState<ICloudAccount | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [formData, setFormData] = useState({
    appleId: '',
    appPassword: '',
  })
  const [formErrors, setFormErrors] = useState<{ appleId?: string; appPassword?: string }>({})
  
  // Состояние для управления пользователями
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingForm, setEditingForm] = useState<{ email: string; password: string; display_name: string }>({
    email: '',
    password: '',
    display_name: '',
  })
  const [editingErrors, setEditingErrors] = useState<{ email?: string; password?: string }>({})
  const [saving, setSaving] = useState(false)
  
  // Состояние для редактирования владельца
  const [editingOwner, setEditingOwner] = useState(false)
  const [ownerForm, setOwnerForm] = useState<{ email: string; password: string; display_name: string }>({
    email: '',
    password: '',
    display_name: '',
  })
  const [ownerErrors, setOwnerErrors] = useState<{ email?: string; password?: string }>({})
  const [savingOwner, setSavingOwner] = useState(false)

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
        setError(t('iphoneBackendError'))
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
    if (role === 'owner' && workspaceId) {
      loadMembers()
    }
  }, [loadStatus, role, workspaceId])
  
  const loadMembers = useCallback(async () => {
    if (!workspaceId || role !== 'owner') return
    setMembersLoading(true)
    try {
      const membersList = await apiRequest<WorkspaceMember[]>(
        `/api/v1/workspaces/${workspaceId}/members/for-settings`,
        { params: { workspace_id: workspaceId } }
      )
      // Преобразуем user_id в id для совместимости
      setMembers(membersList.map(m => ({
        id: (m as any).user_id || m.id,
        email: m.email,
        display_name: m.display_name,
        role: m.role,
        is_active: m.is_active,
      })))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(errorMessage)
    } finally {
      setMembersLoading(false)
    }
  }, [apiRequest, workspaceId, role, toast])
  
  const handleStartEditMember = (member: WorkspaceMember) => {
    setEditingUserId(member.id)
    setEditingForm({
      email: member.email,
      password: '',
      display_name: member.display_name || '',
    })
    setEditingErrors({})
  }
  
  const handleCancelEditMember = () => {
    setEditingUserId(null)
    setEditingForm({ email: '', password: '', display_name: '' })
    setEditingErrors({})
  }
  
  const handleSaveMember = async () => {
    if (!workspaceId || !editingUserId) return
    
    const errors: { email?: string; password?: string } = {}
    const email = editingForm.email.trim()
    const password = editingForm.password.trim()
    
    if (!email) {
      errors.email = t('settingsEmailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('settingsEmailInvalid')
    }
    
    if (password && password.length < 8) {
      errors.password = t('settingsPasswordMinLength')
    }
    
    if (Object.keys(errors).length > 0) {
      setEditingErrors(errors)
      return
    }
    
    setSaving(true)
    setEditingErrors({})
    
    try {
      const payload: { email?: string; password?: string; display_name?: string } = {}
      if (email !== members.find(m => m.id === editingUserId)?.email) {
        payload.email = email
      }
      if (password) {
        payload.password = password
      }
      if (editingForm.display_name !== members.find(m => m.id === editingUserId)?.display_name) {
        payload.display_name = editingForm.display_name
      }
      
      await apiRequest(`/api/v1/workspaces/${workspaceId}/members/${editingUserId}`, {
        method: 'PATCH',
        body: payload,
      })
      
      toast.success(t('settingsMemberUpdated'))
      await loadMembers()
      handleCancelEditMember()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setEditingErrors({ email: errorMessage })
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }
  
  const handleStartEditOwner = async () => {
    try {
      const currentUser = await apiRequest<{ id: string; email: string; display_name: string | null }>('/api/v1/users/me')
      setOwnerForm({
        email: currentUser.email,
        password: '',
        display_name: currentUser.display_name || '',
      })
      setOwnerErrors({})
      setEditingOwner(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(errorMessage)
    }
  }
  
  const handleCancelEditOwner = () => {
    setEditingOwner(false)
    setOwnerForm({ email: '', password: '', display_name: '' })
    setOwnerErrors({})
  }
  
  const handleSaveOwner = async () => {
    const errors: { email?: string; password?: string } = {}
    const email = ownerForm.email.trim()
    const password = ownerForm.password.trim()
    
    if (!email) {
      errors.email = t('settingsEmailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('settingsEmailInvalid')
    }
    
    if (password && password.length < 8) {
      errors.password = t('settingsPasswordMinLength')
    }
    
    if (Object.keys(errors).length > 0) {
      setOwnerErrors(errors)
      return
    }
    
    setSavingOwner(true)
    setOwnerErrors({})
    
    try {
      const payload: { email?: string; password?: string; display_name?: string } = {}
      if (email !== userEmail) {
        payload.email = email
      }
      if (password) {
        payload.password = password
      }
      if (ownerForm.display_name) {
        payload.display_name = ownerForm.display_name
      }
      
      await apiRequest('/api/v1/users/me', {
        method: 'PATCH',
        body: payload,
      })
      
      toast.success(t('settingsOwnerUpdated'))
      handleCancelEditOwner()
      // Перезагружаем страницу для обновления данных пользователя
      window.location.reload()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setOwnerErrors({ email: errorMessage })
      toast.error(errorMessage)
    } finally {
      setSavingOwner(false)
    }
  }

  const handleConnect = async () => {
    if (!workspaceId) {
      const msg = t('workspaceMissing') || 'Рабочее пространство не выбрано'
      setError(msg)
      toast.error(msg)
      return
    }

    // Валидация
    const errors: { appleId?: string; appPassword?: string } = {}
    const appleId = formData.appleId.trim()
    const appPassword = formData.appPassword.trim()

    if (!appleId) {
      errors.appleId = t('icloudAppleIdRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appleId)) {
      errors.appleId = t('icloudAppleIdInvalid')
    }

    if (!appPassword) {
      errors.appPassword = t('icloudAppPasswordRequired')
    } else if (appPassword.length < 16) {
      errors.appPassword = t('icloudAppPasswordTooShort')
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})
    setConnecting(true)
    setError(null)

    try {
      await apiRequest('/api/v1/icloud/connect', {
        method: 'POST',
        params: { workspace_id: workspaceId },
        body: {
          apple_id: appleId,
          app_password: appPassword,
        },
      })

      setFormData({ appleId: '', appPassword: '' })
      toast.success(t('icloudConnectedSuccess'))
      await loadStatus()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isNetworkError = 
        err instanceof TypeError || 
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed')
      
      // Обрабатываем сетевые ошибки отдельно
      if (isNetworkError) {
        const networkErrorMsg = t('iphoneBackendError')
        setError(networkErrorMsg)
        toast.error(networkErrorMsg)
      } else {
        // Извлекаем понятное сообщение об ошибке из ответа API
        let displayMessage = errorMessage
        
        // Пытаемся извлечь сообщение из структуры ошибки FastAPI
        // FastAPI возвращает ошибки в формате: "detail: {code: '...', message: '...'}" или "detail: 'сообщение'"
        try {
          // Проверяем, содержит ли сообщение структуру ошибки
          if (errorMessage.includes('CONNECTION_FAILED') || errorMessage.includes('Не удалось подключиться к iCloud')) {
            // Ошибка подключения к iCloud - извлекаем детали
            const match = errorMessage.match(/Не удалось подключиться к iCloud: (.+?)(?:;|$)/)
            if (match) {
              displayMessage = `Ошибка подключения к iCloud: ${match[1].trim()}`
            } else if (errorMessage.includes('CONNECTION_FAILED')) {
              displayMessage = 'Не удалось подключиться к iCloud. Проверьте правильность Apple ID и app-specific password.'
            }
          } else if (errorMessage.includes('ALREADY_CONNECTED')) {
            displayMessage = 'Аккаунт уже подключен для этого workspace'
          }
        } catch {
          // Используем исходное сообщение
        }
        
        setError(displayMessage)
        toast.error(displayMessage)
      }
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!workspaceId || !account) return

    if (!window.confirm(t('icloudDisconnectConfirm'))) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await apiRequest('/api/v1/icloud/disconnect', {
        method: 'DELETE',
        params: { workspace_id: workspaceId },
      })

      toast.success(t('icloudDisconnectedSuccess'))
      await loadStatus()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isNetworkError = 
        err instanceof TypeError || 
        errorMessage.includes('Failed to fetch') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed')
      
      if (isNetworkError) {
        const networkErrorMsg = t('iphoneBackendError')
        setError(networkErrorMsg)
        toast.error(networkErrorMsg)
      } else {
        setError(errorMessage)
        toast.error(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) {
      return t('icloudNeverSynced')
    }
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

  return (
    <div data-testid="settings-page" style={{ marginTop: 'var(--space-3)' }}>
      <SectionHeader title={t('menuSettings')} />

      {!workspaceId && (
        <Alert type="info" style={{ marginTop: 'var(--space-4)' }}>
          {t('workspaceMissing') || 'Рабочее пространство не выбрано'}
        </Alert>
      )}

      {loading && <Alert type="info">{t('contactsLoading')}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      {/* Секция iCloud */}
      <div style={{ marginTop: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-3)' }}>{t('settingsICloudSection')}</h2>

        {!account ? (
          <div data-testid="icloud-connect-form" style={{ maxWidth: 500, marginTop: 'var(--space-4)' }}>
            <p style={{ color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>{t('icloudConnectDescription')}</p>

            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <TextField
                label={t('icloudAppleIdLabel')}
                placeholder={t('icloudAppleIdPlaceholder')}
                value={formData.appleId}
                onChange={(value) => setFormData((prev) => ({ ...prev, appleId: value }))}
                error={formErrors.appleId}
                required
                type="email"
                dataTestId="icloud-apple-id-input"
              />

              <TextField
                label={t('icloudAppPasswordLabel')}
                placeholder={t('icloudAppPasswordPlaceholder')}
                value={formData.appPassword}
                onChange={(value) => setFormData((prev) => ({ ...prev, appPassword: value }))}
                error={formErrors.appPassword}
                required
                type="password"
                dataTestId="icloud-app-password-input"
              />

              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
                {t('icloudAppPasswordHint')}
              </div>

              <Button onClick={handleConnect} loading={connecting} dataTestId="icloud-connect-button">
                {t('icloudConnectButton')}
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
              <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-3)' }}>{t('icloudStatusTitle')}</h3>

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

                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Button onClick={handleDisconnect} variant="secondary" disabled={loading} dataTestId="icloud-disconnect-button">
                    {t('icloudDisconnectButton')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Секция управления пользователями (только для владельца) */}
      {role === 'owner' && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-lg)', marginBottom: 'var(--space-3)' }}>{t('settingsUsersSection')}</h2>

          {/* Редактирование владельца */}
          <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-3)' }}>{t('settingsOwnerAccount')}</h3>
            {!editingOwner ? (
              <div
                style={{
                  padding: 'var(--space-4)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-surface)',
                }}
              >
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                      {t('settingsEmailLabel')}
                    </div>
                    <div style={{ fontSize: 'var(--font-md)' }}>{userEmail || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                      {t('settingsPasswordLabel')}
                    </div>
                    <div style={{ fontSize: 'var(--font-md)', color: 'var(--color-muted)' }}>••••••••</div>
                  </div>
                  <Button onClick={handleStartEditOwner} variant="secondary" dataTestId="settings-edit-owner">
                    {t('settingsEditButton')}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: 'var(--space-4)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-surface)',
                }}
              >
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  <TextField
                    label={t('settingsEmailLabel')}
                    value={ownerForm.email}
                    onChange={(value) => setOwnerForm((prev) => ({ ...prev, email: value }))}
                    error={ownerErrors.email}
                    type="email"
                    required
                    dataTestId="settings-owner-email"
                  />
                  <TextField
                    label={t('settingsPasswordLabel')}
                    placeholder={t('settingsPasswordPlaceholder')}
                    value={ownerForm.password}
                    onChange={(value) => setOwnerForm((prev) => ({ ...prev, password: value }))}
                    error={ownerErrors.password}
                    type="password"
                    dataTestId="settings-owner-password"
                  />
                  <TextField
                    label={t('settingsDisplayNameLabel')}
                    value={ownerForm.display_name}
                    onChange={(value) => setOwnerForm((prev) => ({ ...prev, display_name: value }))}
                    dataTestId="settings-owner-display-name"
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button onClick={handleSaveOwner} loading={savingOwner} dataTestId="settings-save-owner">
                      {t('settingsSaveButton')}
                    </Button>
                    <Button onClick={handleCancelEditOwner} variant="secondary" disabled={savingOwner}>
                      {t('settingsCancelButton')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Список ассистентов */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-md)', marginBottom: 'var(--space-3)' }}>{t('settingsAssistantsSection')}</h3>
            {membersLoading ? (
              <Alert type="info">{t('contactsLoading')}</Alert>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                {members
                  .filter((m) => m.role === 'assistant')
                  .map((member) => (
                    <div
                      key={member.id}
                      style={{
                        padding: 'var(--space-4)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-surface)',
                      }}
                    >
                      {editingUserId === member.id ? (
                        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                          <TextField
                            label={t('settingsEmailLabel')}
                            value={editingForm.email}
                            onChange={(value) => setEditingForm((prev) => ({ ...prev, email: value }))}
                            error={editingErrors.email}
                            type="email"
                            required
                            dataTestId={`settings-assistant-email-${member.id}`}
                          />
                          <TextField
                            label={t('settingsPasswordLabel')}
                            placeholder={t('settingsPasswordPlaceholder')}
                            value={editingForm.password}
                            onChange={(value) => setEditingForm((prev) => ({ ...prev, password: value }))}
                            error={editingErrors.password}
                            type="password"
                            dataTestId={`settings-assistant-password-${member.id}`}
                          />
                          <TextField
                            label={t('settingsDisplayNameLabel')}
                            value={editingForm.display_name}
                            onChange={(value) => setEditingForm((prev) => ({ ...prev, display_name: value }))}
                            dataTestId={`settings-assistant-display-name-${member.id}`}
                          />
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <Button onClick={handleSaveMember} loading={saving} dataTestId={`settings-save-assistant-${member.id}`}>
                              {t('settingsSaveButton')}
                            </Button>
                            <Button onClick={handleCancelEditMember} variant="secondary" disabled={saving}>
                              {t('settingsCancelButton')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                          <div>
                            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                              {t('settingsEmailLabel')}
                            </div>
                            <div style={{ fontSize: 'var(--font-md)' }}>{member.email}</div>
                          </div>
                          {member.display_name && (
                            <div>
                              <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                                {t('settingsDisplayNameLabel')}
                              </div>
                              <div style={{ fontSize: 'var(--font-md)' }}>{member.display_name}</div>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)', marginBottom: 4 }}>
                              {t('settingsPasswordLabel')}
                            </div>
                            <div style={{ fontSize: 'var(--font-md)', color: 'var(--color-muted)' }}>••••••••</div>
                          </div>
                          <Button onClick={() => handleStartEditMember(member)} variant="secondary" dataTestId={`settings-edit-assistant-${member.id}`}>
                            {t('settingsEditButton')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                {members.filter((m) => m.role === 'assistant').length === 0 && (
                  <Alert type="info">{t('settingsNoAssistants')}</Alert>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
