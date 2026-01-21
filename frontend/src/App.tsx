import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ContactsPage from './pages/ContactsPage'
import PlaceholderPage from './pages/PlaceholderPage'
import RemindersPage from './pages/RemindersPage'
import TimelinePage from './pages/TimelinePage'
import type { ApiRequestOptions, Contact, ImportContact, Interaction, MeResponse, Reminder } from './types'

export default function App() {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const [me, setMe] = useState<MeResponse | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [backendStatus, setBackendStatus] = useState<'checking' | 'ok' | 'down'>('checking')
  const [searchQuery, setSearchQuery] = useState('')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [contactForm, setContactForm] = useState({
    displayName: '',
    tieStrength: 'medium',
    visibility: 'shared',
    email: '',
  })
  const [contactError, setContactError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

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
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await response.text()
      let payload: unknown = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = text
      }
      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : typeof payload === 'string'
              ? payload
              : `Ошибка API: ${response.status}`
        throw new Error(message || `Ошибка API: ${response.status}`)
      }
      return payload as T
    },
    [apiBase, workspaceId],
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

    fetch(`${apiBase}/api/v1/me`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: MeResponse) => {
        if (!isMounted) return
        setMe(data)
        setWorkspaceId(data.workspaces[0]?.workspace.id || null)
      })
      .catch((e) => setError(String(e)))
    return () => {
      isMounted = false
    }
  }, [apiBase])

  const loadContacts = useCallback(async () => {
    if (!workspaceId) return
    setContactsLoading(true)
    setContactError(null)
    try {
      const res = await apiRequest<{ data: Contact[] }>('/api/v1/contacts')
      setContacts(res.data || [])
    } catch (e) {
      setContactError((e as Error).message)
    } finally {
      setContactsLoading(false)
    }
  }, [apiRequest, workspaceId])

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

  const handleCreateContact = async () => {
    if (!workspaceId) return
    setContactError(null)
    try {
      const payload = {
        display_name: contactForm.displayName.trim(),
        tie_strength: contactForm.tieStrength,
        visibility: contactForm.visibility,
        emails: contactForm.email ? [contactForm.email.trim()] : [],
      }
      const created = await apiRequest<Contact>('/api/v1/contacts', { method: 'POST', body: payload })
      setContacts((prev) => [created, ...prev])
      setContactForm({ displayName: '', tieStrength: 'medium', visibility: 'shared', email: '' })
    } catch (e) {
      setContactError((e as Error).message)
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

  const parseCsv = (text: string): ImportContact[] => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
    if (lines.length === 0) return []
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const nameIdx = headers.findIndex((h) => ['display_name', 'name', 'full_name'].includes(h))
    const emailIdx = headers.findIndex((h) => ['email', 'emails'].includes(h))
    const phoneIdx = headers.findIndex((h) => ['phone', 'phones', 'телефон', 'phone_number'].includes(h))
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim())
      const name = nameIdx >= 0 ? cells[nameIdx] : cells[0]
      const email = emailIdx >= 0 ? cells[emailIdx] : ''
      const phone = phoneIdx >= 0 ? cells[phoneIdx] : ''
      return {
        display_name: name || 'Без имени',
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
      }
    })
  }

  const parseVcard = (text: string): ImportContact[] => {
    const cards = text.split(/END:VCARD/i)
    return cards
      .map((raw) => raw.trim())
      .filter((raw) => raw.length > 0)
      .map((raw) => {
        const lines = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        const nameLine = lines.find((l) => l.toUpperCase().startsWith('FN:'))
        const emailLine = lines.find((l) => l.toUpperCase().startsWith('EMAIL'))
        const phoneLine = lines.find((l) => l.toUpperCase().startsWith('TEL'))
        const name = nameLine ? nameLine.split(':').slice(1).join(':').trim() : 'Без имени'
        const email = emailLine ? emailLine.split(':').slice(1).join(':').trim() : ''
        const phone = phoneLine ? phoneLine.split(':').slice(1).join(':').trim() : ''
        return {
          display_name: name || 'Без имени',
          emails: email ? [email] : [],
          phones: phone ? [phone] : [],
        }
      })
  }

  const parseJson = (text: string): ImportContact[] => {
    const data = JSON.parse(text)
    if (!Array.isArray(data)) return []
    return data.map((item) => {
      const name = item.display_name || item.name || item.full_name || 'Без имени'
      const email = item.email || item.emails?.[0] || ''
      const phone = item.phone || item.phones?.[0] || ''
      return {
        display_name: String(name),
        emails: email ? [String(email)] : [],
        phones: phone ? [String(phone)] : [],
      }
    })
  }

  const handleImportContacts = async (file: File) => {
    if (!workspaceId) return
    setImportStatus('Импорт выполняется…')
    setContactError(null)
    try {
      const text = await file.text()
      const lowerName = file.name.toLowerCase()
      let contactsToImport: ImportContact[] = []
      if (lowerName.endsWith('.vcf') || lowerName.endsWith('.vcard')) {
        contactsToImport = parseVcard(text)
      } else if (lowerName.endsWith('.json')) {
        contactsToImport = parseJson(text)
      } else {
        contactsToImport = parseCsv(text)
      }

      let successCount = 0
      for (const contact of contactsToImport) {
        await apiRequest<Contact>('/api/v1/contacts', {
          method: 'POST',
          body: {
            display_name: contact.display_name,
            tie_strength: 'medium',
            visibility: 'shared',
            emails: contact.emails,
            phones: contact.phones,
          },
        })
        successCount += 1
      }
      setImportStatus(`Импорт завершён: ${successCount} контактов`)
      await loadContacts()
    } catch (e) {
      setImportStatus(null)
      setContactError(`Ошибка импорта: ${(e as Error).message}`)
    }
  }

  const workspaceHint = workspaceId ? null : (
    <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 8 }}>
      Не найден workspace. Проверьте dev seed и доступ к /api/v1/me.
    </div>
  )

  return (
    <Layout searchQuery={searchQuery} onSearchChange={setSearchQuery} userEmail={me?.user.email}>
      <p style={{ color: '#666', marginTop: 0 }}>Минимальный интерфейс для работы с базовыми сущностями.</p>
      {workspaceHint}

      <Routes>
        <Route path="/" element={<Navigate to="/contacts" />} />
        <Route
          path="/contacts"
          element={
            <ContactsPage
              contacts={contacts}
              contactsLoading={contactsLoading}
              contactError={contactError}
              importStatus={importStatus}
              contactForm={contactForm}
              onContactFormChange={setContactForm}
              onRefreshContacts={loadContacts}
              onCreateContact={handleCreateContact}
              onOpenContact={(contact) => setSelectedContact(contact)}
              onImportContacts={handleImportContacts}
              selectedContact={selectedContact}
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
              reminders={reminders}
              remindersLoading={remindersLoading}
              reminderError={reminderError}
              reminderForm={reminderForm}
              onReminderFormChange={setReminderForm}
              onCreateReminder={handleCreateReminder}
              onRefreshReminders={loadReminders}
            />
          }
        />
        <Route path="/introductions" element={<PlaceholderPage title="Интродукции" description="Раздел в разработке." />} />
        <Route path="/projects" element={<PlaceholderPage title="Проекты" description="Раздел в разработке." />} />
        <Route path="/strategy" element={<PlaceholderPage title="Стратегия" description="Раздел в разработке." />} />
        <Route path="/audit" element={<PlaceholderPage title="Аудит" description="Раздел в разработке." />} />
      </Routes>

      <div style={{ marginTop: 16, color: '#666' }}>
        API Base URL: <code>{apiBase}</code>
      </div>
      <div style={{ marginTop: 8, color: '#666' }}>
        Backend статус:{' '}
        <strong>{backendStatus === 'checking' ? 'проверка…' : backendStatus === 'ok' ? 'доступен' : 'недоступен'}</strong>
      </div>
      {error && <div style={{ marginTop: 8, color: '#b00020' }}>{error}</div>}
    </Layout>
  )
}
