import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import CommandPalette from './components/CommandPalette'
import { t } from './i18n/t'
import ContactCardPage from './pages/ContactCardPage'
import ContactsPage from './pages/ContactsPage'
import DuplicatesPage from './pages/DuplicatesPage'
import TodayPage from './pages/TodayPage'
import AuditPage from './pages/AuditPage'
import PlaceholderPage from './pages/PlaceholderPage'
import RemindersPage from './pages/RemindersPage'
import IntroductionsPage from './pages/IntroductionsPage'
import StaleContactsPage from './pages/StaleContactsPage'
import WeekPanelPage from './pages/WeekPanelPage'
import StrategyPage from './pages/StrategyPage'
import TimelinePage from './pages/TimelinePage'
import { ToastProvider } from './components/ui/Toast'
import type {
  ApiRequestOptions,
  AssistantMessageCreate,
  Contact,
  DuplicateGroup,
  ImportReport,
  Interaction,
  Introduction,
  MeResponse,
  Reminder,
  SearchResults,
} from './types'

export default function App() {
  const navigate = useNavigate()
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const isDevMode = import.meta.env.DEV
  const [debugRole, setDebugRole] = useState<'owner' | 'assistant'>(() => {
    if (!isDevMode) return 'owner'
    const stored = window.localStorage.getItem('debugRole')
    return stored === 'assistant' ? 'assistant' : 'owner'
  })
  const [me, setMe] = useState<MeResponse | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'down'>('checking')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contactForm, setContactForm] = useState({
    displayName: '',
    tieStrength: 'medium',
    visibility: 'shared',
    email: '',
    phone: '',
  })
  const [contactError, setContactError] = useState<string | null>(null)
  const [contactFormErrors, setContactFormErrors] = useState<{ displayName?: string; email?: string; phone?: string }>({})
  const [contactSubmitError, setContactSubmitError] = useState<string | null>(null)
  const [contactSubmitting, setContactSubmitting] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')

  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [interactionForm, setInteractionForm] = useState({
    type: 'call',
    occurredAt: new Date().toISOString(),
    summary: '',
  })
  const [timelineError, setTimelineError] = useState<string | null>(null)

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [remindersLoading, setRemindersLoading] = useState(false)
  const [reminderForm, setReminderForm] = useState({
    type: 'follow_up',
    title: '',
    dueAt: new Date().toISOString(),
  })
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const apiRequest = useCallback(
    async <T,>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
      const { method = 'GET', body, params } = options
      const url = new URL(path, apiBase)
      if (workspaceId) {
        url.searchParams.set('workspace_id', workspaceId)
      }
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value))
          }
        })
      }
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
      const response = await fetch(url.toString(), {
        method,
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(isDevMode ? { 'X-Debug-Role': debugRole } : {}),
        },
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
      })
      const text = await response.text()
      let payload: unknown = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = text
      }
      if (!response.ok) {
        const errorPayload =
          typeof payload === 'object' && payload && 'error' in payload
            ? (payload as { error?: { message?: string; details?: { errors?: Array<{ loc?: unknown[]; msg?: string }> } } }).error
            : undefined
        const details =
          errorPayload?.details?.errors
            ?.map((item) => {
              const loc = item.loc ? item.loc.join('.') : ''
              const msg = item.msg || ''
              return loc && msg ? `${loc}: ${msg}` : loc || msg
            })
            .filter(Boolean)
            .join('; ')
        const detailMessage =
          typeof payload === 'object' && payload && 'detail' in payload
            ? (payload as { detail?: { message?: string } | string }).detail
            : undefined
        const message =
          errorPayload?.message ||
          (typeof detailMessage === 'object' && detailMessage ? detailMessage.message : undefined) ||
          (typeof detailMessage === 'string' ? detailMessage : undefined) ||
          (typeof payload === 'object' && payload && 'message' in payload ? (payload as { message?: string }).message : undefined) ||
          (typeof payload === 'string' ? payload : undefined)
        const combined = details ? `${message ?? t('apiErrorPrefix')}: ${details}` : message
        throw new Error(combined || `${t('apiErrorPrefix')}: ${response.status}`)
      }
      return payload as T
    },
    [apiBase, workspaceId, debugRole, isDevMode],
  )

  const fetchWorkspaceId = useCallback(async () => {
    const response = await fetch(`${apiBase}/api/v1/me`, {
      headers: isDevMode ? { 'X-Debug-Role': debugRole } : undefined,
    })
    if (!response.ok) {
      throw new Error(t('workspaceMissing'))
    }
    const data = (await response.json()) as MeResponse
    setMe(data)
    const wsId = data.workspaces[0]?.workspace.id || null
    setWorkspaceId(wsId)
    return wsId
  }, [apiBase, debugRole, isDevMode])

  const createAssistantMessage = useCallback(
    async (payload: AssistantMessageCreate) => {
      const wsId = workspaceId || (await fetchWorkspaceId())
      if (!wsId) {
        throw new Error(t('workspaceMissing'))
      }
      await apiRequest('/api/v1/assistant/messages', {
        method: 'POST',
        body: payload,
        params: { workspace_id: wsId },
      })
    },
    [apiRequest, fetchWorkspaceId, workspaceId],
  )

  useEffect(() => {
    let isMounted = true
    setBackendStatus('checking')
    fetch(`${apiBase}/health`)
      .then((r) => {
        if (!r.ok) throw new Error('health failed')
        if (isMounted) setBackendStatus('ok')
      })
      .catch(() => {
        if (isMounted) setBackendStatus('down')
      })

    fetchWorkspaceId().catch((e) => setError(String(e)))
    return () => {
      isMounted = false
    }
  }, [apiBase, debugRole, isDevMode, fetchWorkspaceId])

  useEffect(() => {
    if (!isDevMode) return
    window.localStorage.setItem('debugRole', debugRole)
  }, [debugRole, isDevMode])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    let cancelled = false
    const runSearch = async () => {
      const query = debouncedSearch.trim()
      if (query.length < 2) {
        setSearchResults(null)
        setSearchError(null)
        return
      }
      setSearchLoading(true)
      setSearchError(null)
      try {
        const wsId = workspaceId || (await fetchWorkspaceId())
        if (!wsId) {
          throw new Error(t('workspaceMissing'))
        }
        const res = await apiRequest<SearchResults>('/api/v1/search', {
          params: { workspace_id: wsId, q: query },
        })
        if (!cancelled) setSearchResults(res)
      } catch (err) {
        if (!cancelled) {
          setSearchResults(null)
          setSearchError((err as Error).message || t('searchError'))
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }
    void runSearch()
    return () => {
      cancelled = true
    }
  }, [debouncedSearch, apiRequest, workspaceId, fetchWorkspaceId])

  const loadContacts = useCallback(async () => {
    if (!workspaceId) return
    setContactsLoading(true)
    setContactError(null)
    try {
      const res = await apiRequest<{ data: Contact[] }>('/api/v1/contacts', { params: { limit: 200 } })
      setContacts(res.data || [])
    } catch (e) {
      setContactError((e as Error).message)
    } finally {
      setContactsLoading(false)
    }
  }, [apiRequest, workspaceId])

  const searchContacts = useCallback(
    async (query: string) => {
      if (!workspaceId) return []
      const res = await apiRequest<{ data: Contact[] }>('/api/v1/contacts', { params: { limit: 200 } })
      const q = query.trim().toLowerCase()
      if (!q) return res.data || []
      return (res.data || []).filter((item) => item.display_name.toLowerCase().includes(q))
    },
    [apiRequest, workspaceId],
  )

  const loadReminders = useCallback(async () => {
    if (!workspaceId) return
    setRemindersLoading(true)
    setReminderError(null)
    try {
      const res = await apiRequest<{ data: Reminder[] }>('/api/v1/reminders')
      setReminders(res.data || [])
    } catch (e) {
      setReminderError((e as Error).message)
    } finally {
      setRemindersLoading(false)
    }
  }, [apiRequest, workspaceId])

  const loadRemindersForContact = useCallback(
    async (contactId: string) => {
      if (!workspaceId) return []
      const res = await apiRequest<{ data: Reminder[] }>('/api/v1/reminders')
      return (res.data || []).filter((item) => item.contact_id === contactId)
    },
    [apiRequest, workspaceId],
  )

  const loadIntroductionsForContact = useCallback(
    async (contactId: string) => {
      const wsId = workspaceId || (await fetchWorkspaceId())
      if (!wsId) return []
      const res = await apiRequest<{ data: Introduction[] }>('/api/v1/introductions', {
        params: { contact_id: contactId, limit: 200 },
      })
      return res.data || []
    },
    [apiRequest, fetchWorkspaceId, workspaceId],
  )

  const loadTimeline = useCallback(
    async (contactId: string) => {
      if (!workspaceId) return
      setTimelineError(null)
      try {
        const res = await apiRequest<{ data: Interaction[] }>(`/api/v1/contacts/${contactId}/interactions`)
        setInteractions(res.data || [])
      } catch (e) {
        setTimelineError((e as Error).message)
      }
    },
    [apiRequest, workspaceId],
  )

  const loadContactInteractions = useCallback(
    async (contactId: string) => {
      if (!workspaceId) return []
      const res = await apiRequest<{ data: Interaction[] }>(`/api/v1/contacts/${contactId}/interactions`)
      return res.data || []
    },
    [apiRequest, workspaceId],
  )

  const createInteraction = useCallback(
    async (
      contactId: string,
      payload: {
        type: string
        occurred_at: string
        summary?: string
        next_action?: string
      },
    ) => {
      if (!workspaceId) return
      await apiRequest(`/api/v1/contacts/${contactId}/interactions`, { method: 'POST', body: payload })
    },
    [apiRequest, workspaceId],
  )

  const createReminder = useCallback(
    async (
      contactId: string,
      payload: {
        title?: string
        body?: string
        due_at: string
      },
    ) => {
      if (!workspaceId) return
      await apiRequest('/api/v1/reminders', {
        method: 'POST',
        body: {
          contact_id: contactId,
          type: 'follow_up',
          title: payload.title,
          body: payload.body,
          due_at: payload.due_at,
        },
      })
    },
    [apiRequest, workspaceId],
  )

  const createIntroduction = useCallback(
    async (payload: {
      requester_contact_id: string
      introducer_contact_id: string
      target_contact_id: string
      ask: string
      benefit_for_requester?: string
      benefit_for_target?: string
      status?: string
    }) => {
      if (!workspaceId) return
      await apiRequest('/api/v1/introductions', { method: 'POST', body: payload })
    },
    [apiRequest, workspaceId],
  )

  const loadContactById = useCallback(
    async (contactId: string) => {
      if (!workspaceId) return null
      const existing = contacts.find((item) => item.id === contactId)
      if (existing) {
        setSelectedContact(existing)
        return existing
      }
      const contact = await apiRequest<Contact>(`/api/v1/contacts/${contactId}`)
      setSelectedContact(contact)
      return contact
    },
    [apiRequest, contacts, workspaceId],
  )

  const updateContact = useCallback(
    async (contactId: string, payload: Record<string, unknown>) => {
      if (!workspaceId) return null
      const updated = await apiRequest<Contact>(`/api/v1/contacts/${contactId}`, {
        method: 'PATCH',
        body: payload,
      })
      setContacts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedContact(updated)
      return updated
    },
    [apiRequest, workspaceId],
  )

  const resolveOrganizationId = useCallback(
    async (name: string) => {
      if (!workspaceId) return null
      const trimmed = name.trim()
      if (!trimmed) return null
      const list = await apiRequest<Array<{ id: string; name: string }>>('/api/v1/organizations', {
        params: { q: trimmed, limit: 50 },
      })
      const existing = list.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
      if (existing) return existing.id
      const created = await apiRequest<{ id: string }>('/api/v1/organizations', {
        method: 'POST',
        body: { name: trimmed },
      })
      return created.id
    },
    [apiRequest, workspaceId],
  )

  const selectContact = useCallback(
    async (contactId: string) => {
      const contact = await loadContactById(contactId)
      if (contact) {
        await loadTimeline(contact.id)
      }
      return contact
    },
    [loadContactById, loadTimeline],
  )

  useEffect(() => {
    if (workspaceId) {
      loadContacts()
      loadReminders()
    }
  }, [loadContacts, loadReminders, workspaceId])

  const validateContactForm = () => {
    const errors: { displayName?: string; email?: string; phone?: string } = {}
    const name = contactForm.displayName.trim()
    const email = contactForm.email.trim()
    const phone = contactForm.phone.trim()

    if (!name) {
      errors.displayName = t('contactValidationName')
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('contactValidationEmail')
    }
    if (phone && !/^\+?\d+$/.test(phone)) {
      errors.phone = t('contactValidationPhone')
    }

    setContactFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreateContact = async () => {
    if (!workspaceId) return
    setContactSubmitError(null)
    if (!validateContactForm()) return
    setContactSubmitting(true)
    try {
      const payload = {
        display_name: contactForm.displayName.trim(),
        tie_strength: contactForm.tieStrength,
        visibility: contactForm.visibility,
        emails: contactForm.email.trim() ? [contactForm.email.trim()] : [],
        phones: contactForm.phone.trim() ? [contactForm.phone.trim()] : [],
      }
      const created = await apiRequest<Contact>('/api/v1/contacts', { method: 'POST', body: payload })
      setContacts((prev) => [created, ...prev])
      setContactForm({ displayName: '', tieStrength: 'medium', visibility: 'shared', email: '', phone: '' })
      setContactFormErrors({})
      setContactModalOpen(false)
    } catch (e) {
      const baseMessage = t('contactCreateErrorBase')
      const detail = (e as Error).message
      setContactSubmitError(
        import.meta.env.DEV ? `${baseMessage} ${t('contactCreateErrorDetails')} ${detail}` : baseMessage,
      )
    } finally {
      setContactSubmitting(false)
    }
  }

  const handleCreateInteraction = async (contactId: string) => {
    setTimelineError(null)
    try {
      const payload = {
        type: interactionForm.type,
        occurred_at: interactionForm.occurredAt,
        summary: interactionForm.summary || undefined,
      }
      await apiRequest(`/api/v1/contacts/${contactId}/interactions`, { method: 'POST', body: payload })
      await loadTimeline(contactId)
      setInteractionForm({ type: 'call', occurredAt: new Date().toISOString(), summary: '' })
    } catch (e) {
      setTimelineError((e as Error).message)
    }
  }

  const handleCreateReminder = async () => {
    if (!workspaceId) return
    setReminderError(null)
    try {
      const payload = {
        type: reminderForm.type,
        due_at: reminderForm.dueAt,
        title: reminderForm.title || undefined,
      }
      const created = await apiRequest<Reminder>('/api/v1/reminders', { method: 'POST', body: payload })
      setReminders((prev) => [created, ...prev])
      setReminderForm({ type: 'follow_up', title: '', dueAt: new Date().toISOString() })
    } catch (e) {
      setReminderError((e as Error).message)
    }
  }

  const handleImportContacts = async (file: File): Promise<ImportReport> => {
    if (!workspaceId) {
      throw new Error(t('workspaceMissing'))
    }
    const formData = new FormData()
    formData.append('file', file)
    const report = await apiRequest<ImportReport>('/api/v1/contacts/import', {
      method: 'POST',
      body: formData,
    })
    await loadContacts()
    return report
  }

  const loadDuplicates = useCallback(async () => {
    const wsId = workspaceId || (await fetchWorkspaceId())
    if (!wsId) {
      throw new Error(t('workspaceMissing'))
    }
    const res = await apiRequest<{ groups: DuplicateGroup[] }>('/api/v1/contacts/duplicates', {
      params: { workspace_id: wsId },
    })
    return res.groups || []
  }, [apiRequest, workspaceId, fetchWorkspaceId])

  const mergeContacts = useCallback(
    async (primaryId: string, mergeIds: string[]) => {
      const wsId = workspaceId || (await fetchWorkspaceId())
      if (!wsId) {
        throw new Error(t('workspaceMissing'))
      }
      await apiRequest('/api/v1/contacts/merge', {
        method: 'POST',
        params: { workspace_id: wsId },
        body: { primary_contact_id: primaryId, merge_contact_ids: mergeIds },
      })
    },
    [apiRequest, workspaceId, fetchWorkspaceId],
  )

  const workspaceHint = workspaceId ? null : (
    <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 8 }}>
      {t('workspaceMissing')}
    </div>
  )

  const visibleContactsForPalette =
    debugRole === 'assistant' ? contacts.filter((contact) => contact.visibility !== 'private') : contacts

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const closePalette = () => {
    setCommandPaletteOpen(false)
    setCommandQuery('')
  }

  const paletteCommands = [
    {
      id: 'create-contact',
      label: t('commandCreateContact'),
      onSelect: () => {
        navigate('/contacts')
        setContactModalOpen(true)
        setContactFormErrors({})
        setContactSubmitError(null)
        closePalette()
      },
    },
    {
      id: 'contacts',
      label: t('commandGoContacts'),
      onSelect: () => {
        navigate('/contacts')
        closePalette()
      },
    },
    {
      id: 'reminders',
      label: t('commandGoReminders'),
      onSelect: () => {
        navigate('/reminders')
        closePalette()
      },
    },
    {
      id: 'introductions',
      label: t('commandGoIntroductions'),
      onSelect: () => {
        navigate('/introductions')
        closePalette()
      },
    },
    {
      id: 'projects',
      label: t('commandGoProjects'),
      onSelect: () => {
        navigate('/projects')
        closePalette()
      },
    },
    {
      id: 'strategy',
      label: t('commandGoStrategy'),
      onSelect: () => {
        navigate('/strategy')
        closePalette()
      },
    },
    {
      id: 'week',
      label: t('commandGoWeekPanel'),
      onSelect: () => {
        navigate('/week')
        closePalette()
      },
    },
  ]

  return (
    <ToastProvider>
      <Layout
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery('')}
        searchResults={searchResults}
        searchLoading={searchLoading}
        searchError={searchError}
        userEmail={me?.user.email}
        roleLabel={debugRole === 'assistant' ? t('roleAssistant') : t('roleOwner')}
        isDevMode={isDevMode}
        devRole={debugRole}
        onDevRoleChange={setDebugRole}
      >
        <CommandPalette
          open={commandPaletteOpen}
          query={commandQuery}
          onQueryChange={setCommandQuery}
          onClose={closePalette}
          commands={paletteCommands}
          contacts={visibleContactsForPalette}
          onSelectContact={(contactId) => {
            navigate(`/contacts/${contactId}`)
            closePalette()
          }}
        />
        <p style={{ color: '#666', marginTop: 0 }}>{t('appTagline')}</p>
        {workspaceHint}

        <Routes>
        <Route path="/" element={<Navigate to="/contacts" />} />
        <Route
          path="/contacts"
          element={
            <ContactsPage
              contacts={contacts}
              role={debugRole}
              contactsLoading={contactsLoading}
              contactError={contactError}
              contactForm={contactForm}
              contactFormErrors={contactFormErrors}
              searchQuery={debouncedSearch}
              onContactFormChange={setContactForm}
              onRefreshContacts={loadContacts}
              onCreateContact={handleCreateContact}
              onOpenContact={(contact) => setSelectedContact(contact)}
              onImportContacts={handleImportContacts}
              selectedContact={selectedContact}
              submitError={contactSubmitError}
              submitting={contactSubmitting}
              isModalOpen={contactModalOpen}
              onOpenModal={() => {
                setContactModalOpen(true)
                setContactFormErrors({})
                setContactSubmitError(null)
              }}
              onCloseModal={() => {
                setContactModalOpen(false)
                setContactFormErrors({})
                setContactSubmitError(null)
              }}
            />
          }
        />
        <Route
          path="/today"
          element={
            <TodayPage
              contacts={contacts}
              contactsLoading={contactsLoading}
              contactError={contactError}
              role={debugRole}
              reminders={reminders}
              remindersLoading={remindersLoading}
              reminderError={reminderError}
              loadInteractions={loadContactInteractions}
              onRefreshContacts={loadContacts}
              onRefreshReminders={loadReminders}
              apiRequest={apiRequest}
            />
          }
        />
        <Route path="/duplicates" element={<DuplicatesPage loadDuplicates={loadDuplicates} mergeContacts={mergeContacts} />} />
        <Route
          path="/contacts/:contactId"
          element={
            <ContactCardPage
              role={debugRole}
              loadContact={loadContactById}
              updateContact={updateContact}
              resolveOrganizationId={resolveOrganizationId}
              loadInteractions={loadContactInteractions}
              createInteraction={createInteraction}
              createReminder={createReminder}
              onReminderCreated={loadReminders}
              createIntroduction={createIntroduction}
              searchContacts={searchContacts}
              loadRemindersForContact={loadRemindersForContact}
              loadIntroductionsForContact={loadIntroductionsForContact}
              createAssistantMessage={createAssistantMessage}
            />
          }
        />
        <Route
          path="/contacts/:contactId/timeline"
          element={
            <TimelinePage
              selectedContact={selectedContact}
              onSelectContact={selectContact}
              interactions={interactions}
              interactionForm={interactionForm}
              onInteractionFormChange={setInteractionForm}
              onCreateInteraction={handleCreateInteraction}
              timelineError={timelineError}
            />
          }
        />
        <Route
          path="/reminders"
          element={
            <RemindersPage
              role={debugRole}
              reminders={reminders}
              remindersLoading={remindersLoading}
              reminderError={reminderError}
              reminderForm={reminderForm}
              onReminderFormChange={setReminderForm}
              onCreateReminder={handleCreateReminder}
              onRefreshReminders={loadReminders}
              createAssistantMessage={createAssistantMessage}
            />
          }
        />
        <Route
          path="/week"
          element={
            <WeekPanelPage
              contacts={contacts}
              contactsLoading={contactsLoading}
              contactError={contactError}
              role={debugRole}
              reminders={reminders}
              remindersLoading={remindersLoading}
              reminderError={reminderError}
              loadInteractions={loadContactInteractions}
              onRefreshContacts={loadContacts}
              onRefreshReminders={loadReminders}
              apiRequest={apiRequest}
            />
          }
        />
        <Route
          path="/stale"
          element={
            <StaleContactsPage
              contacts={contacts}
              contactsLoading={contactsLoading}
              contactError={contactError}
              role={debugRole}
              loadInteractions={loadContactInteractions}
              onRefreshContacts={loadContacts}
            />
          }
        />
        <Route
          path="/introductions"
          element={<IntroductionsPage contacts={contacts} apiRequest={apiRequest} role={debugRole} createAssistantMessage={createAssistantMessage} />}
        />
        <Route
          path="/projects"
          element={<PlaceholderPage title={t('menuProjects')} description={t('placeholderDescription')} testId="projects-page" />}
        />
        <Route path="/strategy" element={<StrategyPage />} />
        <Route path="/audit" element={<AuditPage role={debugRole} apiRequest={apiRequest} />} />
      </Routes>

      <div style={{ marginTop: 16, color: '#666' }}>
        {t('apiBaseLabel')}: <code>{apiBase}</code>
      </div>
      <div style={{ marginTop: 8, color: '#666' }}>
        {t('backendStatusLabel')}:{' '}
        <strong>
          {backendStatus === 'checking'
            ? t('backendStatusChecking')
            : backendStatus === 'ok'
              ? t('backendStatusOk')
              : t('backendStatusDown')}
        </strong>
      </div>
        {error && <div style={{ marginTop: 8, color: '#b00020' }}>{error}</div>}
      </Layout>
    </ToastProvider>
  )
}
