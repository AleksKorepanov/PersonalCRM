import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { ApiRequestOptions, AuditEvent, Contact, Interaction, Introduction, Reminder } from '../types'
import { loadCadenceConfig, parseTierFromTags, type CadenceTier } from '../utils/cadence'

type TodayPageProps = {
  contacts: Contact[]
  contactsLoading: boolean
  contactError: string | null
  role: 'owner' | 'assistant'
  reminders: Reminder[]
  remindersLoading: boolean
  reminderError: string | null
  loadInteractions: (contactId: string) => Promise<Interaction[]>
  onRefreshContacts: () => void
  onRefreshReminders: () => void
  apiRequest: <T,>(path: string, options?: ApiRequestOptions) => Promise<T>
}

type TouchInfo = {
  lastTouch: string | null
}

const dayMs = 24 * 60 * 60 * 1000

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const statusLabel = (status: string) => {
  switch (status) {
    case 'requested':
      return t('introStatusRequested')
    case 'approved_a':
      return t('introStatusApprovedA')
    case 'approved_b':
      return t('introStatusApprovedB')
    case 'sent':
      return t('introStatusSent')
    case 'met':
      return t('introStatusMet')
    case 'completed':
      return t('introStatusCompleted')
    case 'canceled':
      return t('introStatusCanceled')
    default:
      return status
  }
}

export default function TodayPage({
  contacts,
  contactsLoading,
  contactError,
  role,
  reminders,
  remindersLoading,
  reminderError,
  loadInteractions,
  onRefreshContacts,
  onRefreshReminders,
  apiRequest,
}: TodayPageProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [touchInfo, setTouchInfo] = useState<Record<string, TouchInfo>>({})
  const [touchLoading, setTouchLoading] = useState(false)
  const [touchError, setTouchError] = useState<string | null>(null)
  const [introductions, setIntroductions] = useState<Introduction[]>([])
  const [introLoading, setIntroLoading] = useState(false)
  const [introError, setIntroError] = useState<string | null>(null)
  const [closingReminderId, setClosingReminderId] = useState<string | null>(null)
  const [closingIntroId, setClosingIntroId] = useState<string | null>(null)
  const [assistantMessages, setAssistantMessages] = useState<AuditEvent[]>([])
  const [assistantMessagesLoading, setAssistantMessagesLoading] = useState(false)
  const [assistantMessagesError, setAssistantMessagesError] = useState<string | null>(null)

  const visibleContacts = role === 'assistant' ? contacts.filter((contact) => contact.visibility !== 'private') : contacts
  const contactById = useMemo(
    () => Object.fromEntries(visibleContacts.map((contact) => [contact.id, contact])),
    [visibleContacts],
  )

  useEffect(() => {
    if (visibleContacts.length === 0) return
    let cancelled = false
    setTouchLoading(true)
    setTouchError(null)
    Promise.allSettled(visibleContacts.map((contact) => loadInteractions(contact.id)))
      .then((results) => {
        if (cancelled) return
        const next: Record<string, TouchInfo> = {}
        results.forEach((result, index) => {
          const contact = visibleContacts[index]
          if (!contact) return
          if (result.status === 'fulfilled') {
            const items = result.value || []
            const last = items.reduce<string | null>((acc, item) => {
              if (!item?.occurred_at) return acc
              if (!acc) return item.occurred_at
              return new Date(item.occurred_at).getTime() > new Date(acc).getTime() ? item.occurred_at : acc
            }, null)
            next[contact.id] = { lastTouch: last }
          } else {
            next[contact.id] = { lastTouch: null }
          }
        })
        setTouchInfo(next)
        if (results.some((item) => item.status === 'rejected')) {
          setTouchError(t('todayLoadInteractionsFailed'))
        }
      })
      .catch(() => {
        if (!cancelled) setTouchError(t('todayLoadInteractionsFailed'))
      })
      .finally(() => {
        if (!cancelled) setTouchLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadInteractions, visibleContacts])

  useEffect(() => {
    let cancelled = false
    setIntroLoading(true)
    setIntroError(null)
    apiRequest<{ data: Introduction[] }>('/api/v1/introductions', { params: { limit: 100 } })
      .then((res) => {
        if (cancelled) return
        setIntroductions(res.data || [])
      })
      .catch((err) => {
        if (cancelled) return
        const detail = err instanceof Error ? err.message : String(err)
        setIntroError(detail || t('todayIntroLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setIntroLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiRequest])

  useEffect(() => {
    if (role !== 'owner') return
    let cancelled = false
    setAssistantMessagesLoading(true)
    setAssistantMessagesError(null)
    apiRequest<{ data: AuditEvent[] }>('/api/v1/audit', {
      params: { limit: 200, entity_type: 'interaction' },
    })
      .then((res) => {
        if (cancelled) return
        const messages = (res.data || []).filter((item) => item.action_key === 'assistant_message.create')
        setAssistantMessages(messages)
      })
      .catch((err) => {
        if (cancelled) return
        const detail = err instanceof Error ? err.message : String(err)
        setAssistantMessagesError(detail || t('assistantMessageLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setAssistantMessagesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiRequest, role])

  const cadenceConfig = useMemo(() => loadCadenceConfig(), [])

  const overdueTouches = useMemo(() => {
    const now = Date.now()
    return visibleContacts
      .map((contact) => {
        const tier = parseTierFromTags(contact.tags) as CadenceTier | null
        const cadenceDays = tier ? cadenceConfig[tier] : null
        const lastTouch = touchInfo[contact.id]?.lastTouch || null
        const lastTouchDate = lastTouch ? new Date(lastTouch) : null
        const nextDueDate = lastTouchDate && cadenceDays ? new Date(lastTouchDate.getTime() + cadenceDays * dayMs) : null
        const overdueDays =
          nextDueDate && Number.isFinite(nextDueDate.getTime()) ? Math.floor((now - nextDueDate.getTime()) / dayMs) : null
        const isOverdue = overdueDays !== null && overdueDays > 0
        return {
          contact,
          tier,
          cadenceDays,
          lastTouchDate,
          nextDueDate,
          overdueDays,
          isOverdue,
        }
      })
      .filter((row) => row.isOverdue)
      .sort((a, b) => (b.overdueDays || 0) - (a.overdueDays || 0))
  }, [cadenceConfig, touchInfo, visibleContacts])

  const remindersFiltered = useMemo(() => {
    const allowedContactIds = new Set(Object.keys(contactById))
    return reminders.filter((reminder) => !reminder.contact_id || allowedContactIds.has(reminder.contact_id))
  }, [reminders, contactById])

  const { remindersToday, remindersTomorrow } = useMemo(() => {
    const now = new Date()
    const todayStart = startOfDay(now).getTime()
    const tomorrowStart = todayStart + dayMs
    const dayAfterStart = tomorrowStart + dayMs
    const openReminders = remindersFiltered.filter((reminder) => reminder.status === 'open')
    return {
      remindersToday: openReminders.filter((reminder) => {
        const due = new Date(reminder.due_at).getTime()
        return due >= todayStart && due < tomorrowStart
      }),
      remindersTomorrow: openReminders.filter((reminder) => {
        const due = new Date(reminder.due_at).getTime()
        return due >= tomorrowStart && due < dayAfterStart
      }),
    }
  }, [remindersFiltered])

  const pendingIntroductions = useMemo(() => {
    const excluded = new Set(['completed', 'canceled'])
    return introductions.filter((intro) => !excluded.has(intro.status))
  }, [introductions])

  const assistantMessageTargets = useMemo(() => {
    const reminderById = Object.fromEntries(reminders.map((reminder) => [reminder.id, reminder]))
    const introById = Object.fromEntries(introductions.map((intro) => [intro.id, intro]))
    return { reminderById, introById }
  }, [introductions, reminders])

  const closeReminder = async (reminderId: string) => {
    setClosingReminderId(reminderId)
    try {
      await apiRequest(`/api/v1/reminders/${reminderId}`, { method: 'PATCH', body: { status: 'done' } })
      toast.success(t('toastSaved'))
      onRefreshReminders()
    } catch (err) {
      toast.error(t('toastActionFailed'))
    } finally {
      setClosingReminderId(null)
    }
  }

  const closeIntroduction = async (introId: string) => {
    setClosingIntroId(introId)
    try {
      await apiRequest(`/api/v1/introductions/${introId}`, { method: 'PATCH', body: { status: 'completed' } })
      toast.success(t('toastSaved'))
      setIntroductions((prev) => prev.filter((item) => item.id !== introId))
    } catch (err) {
      toast.error(t('toastActionFailed'))
    } finally {
      setClosingIntroId(null)
    }
  }

  const describeAssistantTarget = (event: AuditEvent) => {
    const after = event.after as Record<string, unknown> | null
    const targetType = after?.target_type as string | undefined
    const targetId = after?.target_id as string | undefined
    if (!targetType || !targetId) return t('assistantMessageTargetUnknown')
    if (targetType === 'contact') {
      const contact = contactById[targetId]
      return contact ? `${t('assistantMessageTargetContact')}: ${contact.display_name}` : t('assistantMessageTargetContact')
    }
    if (targetType === 'reminder') {
      const reminder = assistantMessageTargets.reminderById[targetId]
      return reminder
        ? `${t('assistantMessageTargetReminder')}: ${reminder.title || t('remindersUntitled')}`
        : t('assistantMessageTargetReminder')
    }
    if (targetType === 'introduction') {
      const intro = assistantMessageTargets.introById[targetId]
      if (!intro) return t('assistantMessageTargetIntroduction')
      const requester = contactById[intro.requester_contact_id]
      const target = contactById[intro.target_contact_id]
      const requesterName = requester?.display_name || t('emptyValue')
      const targetName = target?.display_name || t('emptyValue')
      return `${t('assistantMessageTargetIntroduction')}: ${requesterName} → ${targetName}`
    }
    return t('assistantMessageTargetUnknown')
  }

  return (
    <section style={{ marginTop: 'var(--space-3)' }} data-testid="today-page">
      <SectionHeader title={t('todayTitle')} />
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gap: 12 }} data-testid="today-reminders-section">
          <div style={{ fontWeight: 600 }}>{t('todayRemindersTitle')}</div>
          {remindersLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
          {reminderError && (
            <Alert type="error">
              {t('contactsLoadFailed')}
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" onClick={onRefreshReminders}>
                  {t('contactsRetry')}
                </Button>
              </div>
            </Alert>
          )}
          {!remindersLoading && remindersToday.length === 0 && remindersTomorrow.length === 0 && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }} data-testid="today-reminders-empty">
              {t('todayRemindersEmpty')}
            </div>
          )}
          {[{ label: t('todayRemindersToday'), items: remindersToday }, { label: t('todayRemindersTomorrow'), items: remindersTomorrow }].map(
            (section) => (
              <div key={section.label} style={{ display: 'grid', gap: 8 }} data-testid="today-reminders-group">
                <div style={{ fontSize: 13, color: '#666' }}>{section.label}</div>
                {section.items.map((item) => {
                  const contact = item.contact_id ? contactById[item.contact_id] : null
                  return (
                    <div
                      key={item.id}
                      data-testid={`today-reminder-${item.id}`}
                      style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.title || t('remindersUntitled')}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{new Date(item.due_at).toLocaleString()}</div>
                      {contact && <div style={{ fontSize: 13 }}>{contact.display_name}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          variant="secondary"
                          onClick={() => closeReminder(item.id)}
                          loading={closingReminderId === item.id}
                          disabled={closingReminderId === item.id}
                          dataTestId={`today-reminder-done-${item.id}`}
                        >
                          {t('todayActionDone')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => contact && navigate(`/contacts/${contact.id}`)}
                          disabled={!contact}
                          dataTestId={`today-reminder-open-${item.id}`}
                        >
                          {t('todayActionOpenContact')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => contact && navigate(`/contacts/${contact.id}?action=reminder`)}
                          disabled={!contact}
                          dataTestId={`today-reminder-set-${item.id}`}
                        >
                          {t('todayActionSetReminder')}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ),
          )}
        </div>

        <div style={{ display: 'grid', gap: 12 }} data-testid="today-overdue-section">
          <div style={{ fontWeight: 600 }}>{t('todayOverdueTitle')}</div>
          {contactsLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
          {contactError && (
            <Alert type="error">
              {t('contactsLoadFailed')}
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" onClick={onRefreshContacts}>
                  {t('contactsRetry')}
                </Button>
              </div>
            </Alert>
          )}
          {touchLoading && <Alert type="info">{t('todayOverdueLoading')}</Alert>}
          {touchError && <Alert type="error">{touchError}</Alert>}
          {!touchLoading && overdueTouches.length === 0 && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }} data-testid="today-overdue-empty">
              {t('todayOverdueEmpty')}
            </div>
          )}
          {overdueTouches.map((row) => {
            const lastTouchLabel = row.lastTouchDate ? row.lastTouchDate.toLocaleDateString() : t('todayOverdueNoTouch')
            const overdueLabel =
              row.overdueDays !== null ? `${t('todayOverdueDaysPrefix')} ${row.overdueDays} ${t('todayOverdueDaysSuffix')}` : ''
            return (
              <div
                key={row.contact.id}
                data-testid={`today-overdue-${row.contact.id}`}
                style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
              >
                <div style={{ fontWeight: 600 }}>{row.contact.display_name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {t('todayOverdueLastTouch')}: {lastTouchLabel}
                  {overdueLabel ? ` • ${overdueLabel}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const params = new URLSearchParams({
                        action: 'interaction',
                        interaction_type: 'message',
                        interaction_summary: t('todayOverdueDoneSummary'),
                        tab: 'timeline',
                      })
                      navigate(`/contacts/${row.contact.id}?${params.toString()}`)
                    }}
                    dataTestId={`today-overdue-done-${row.contact.id}`}
                  >
                    {t('todayActionDone')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/contacts/${row.contact.id}`)}
                    dataTestId={`today-overdue-open-${row.contact.id}`}
                  >
                    {t('todayActionOpenContact')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/contacts/${row.contact.id}?action=reminder`)}
                    dataTestId={`today-overdue-set-${row.contact.id}`}
                  >
                    {t('todayActionSetReminder')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'grid', gap: 12 }} data-testid="today-introductions-section">
          <div style={{ fontWeight: 600 }}>{t('todayIntroductionsTitle')}</div>
          {introLoading && <Alert type="info">{t('todayIntroLoading')}</Alert>}
          {introError && <Alert type="error">{introError}</Alert>}
          {!introLoading && pendingIntroductions.length === 0 && (
            <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }} data-testid="today-introductions-empty">
              {t('todayIntroEmpty')}
            </div>
          )}
          {pendingIntroductions.map((intro) => {
            const requester = contactById[intro.requester_contact_id]
            const target = contactById[intro.target_contact_id]
            return (
              <div
                key={intro.id}
                data-testid={`today-introduction-${intro.id}`}
                style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
              >
                <div style={{ fontWeight: 600 }}>
                  {requester?.display_name || t('emptyValue')} → {target?.display_name || t('emptyValue')}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {t('todayIntroStatus')}: {statusLabel(intro.status)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => closeIntroduction(intro.id)}
                    loading={closingIntroId === intro.id}
                    disabled={closingIntroId === intro.id}
                    dataTestId={`today-intro-done-${intro.id}`}
                  >
                    {t('todayActionDone')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => requester && navigate(`/contacts/${requester.id}`)}
                    disabled={!requester}
                    dataTestId={`today-intro-open-${intro.id}`}
                  >
                    {t('todayActionOpenContact')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => requester && navigate(`/contacts/${requester.id}?action=reminder`)}
                    disabled={!requester}
                    dataTestId={`today-intro-set-${intro.id}`}
                  >
                    {t('todayActionSetReminder')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        {role === 'owner' && (
          <div style={{ display: 'grid', gap: 12 }} data-testid="today-assistant-messages-section">
            <div style={{ fontWeight: 600 }}>{t('assistantMessagesTitle')}</div>
            {assistantMessagesLoading && <Alert type="info">{t('assistantMessageLoading')}</Alert>}
            {assistantMessagesError && <Alert type="error">{assistantMessagesError}</Alert>}
            {!assistantMessagesLoading && assistantMessages.length === 0 && (
              <div
                style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}
                data-testid="today-assistant-messages-empty"
              >
                {t('assistantMessageEmpty')}
              </div>
            )}
            {assistantMessages.map((event) => {
              const after = (event.after || {}) as Record<string, unknown>
              const task = (after.task as string | undefined) || t('assistantMessageTaskFallback')
              const reason = after.reason as string | undefined
              const dueAt = after.due_at as string | undefined
              return (
                <div
                  key={event.id}
                  data-testid={`today-assistant-message-${event.id}`}
                  style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
                >
                  <div style={{ fontWeight: 600 }}>{task}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{new Date(event.created_at).toLocaleString()}</div>
                  <div style={{ fontSize: 13 }}>{describeAssistantTarget(event)}</div>
                  {reason && <div style={{ fontSize: 13 }}>{reason}</div>}
                  {dueAt && (
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {t('assistantMessageDueLabel')}: {new Date(dueAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
