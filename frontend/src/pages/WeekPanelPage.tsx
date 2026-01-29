import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import TextField from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { ApiRequestOptions, Contact, Interaction, Reminder } from '../types'
import { loadCadenceConfig, parseTierFromTags, type CadenceTier } from '../utils/cadence'

type WeekPanelPageProps = {
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

type Introduction = {
  id: string
  status: string
  requester_contact_id: string
  introducer_contact_id: string
  target_contact_id: string
  created_at: string
}

const dayMs = 24 * 60 * 60 * 1000
const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export default function WeekPanelPage({
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
}: WeekPanelPageProps) {
  const navigate = useNavigate()
  const [touchInfo, setTouchInfo] = useState<Record<string, TouchInfo>>({})
  const [touchLoading, setTouchLoading] = useState(false)
  const [touchError, setTouchError] = useState<string | null>(null)
  const [introductions, setIntroductions] = useState<Introduction[]>([])
  const [introLoading, setIntroLoading] = useState(false)
  const [introError, setIntroError] = useState<string | null>(null)
  const [closingReminderId, setClosingReminderId] = useState<string | null>(null)
  const [followUpContact, setFollowUpContact] = useState<Contact | null>(null)
  const [followUpDate, setFollowUpDate] = useState(toLocalInputValue(new Date()))
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const toast = useToast()
  const [overdueActionContact, setOverdueActionContact] = useState<Contact | null>(null)
  const [interactionStats, setInteractionStats] = useState({ last7: 0, last30: 0 })

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
        let totalLast7 = 0
        let totalLast30 = 0
        const now = Date.now()
        const last7Limit = now - 7 * dayMs
        const last30Limit = now - 30 * dayMs
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
            items.forEach((item) => {
              const ts = new Date(item.occurred_at).getTime()
              if (!Number.isFinite(ts)) return
              if (ts >= last7Limit) totalLast7 += 1
              if (ts >= last30Limit) totalLast30 += 1
            })
            next[contact.id] = { lastTouch: last }
          } else {
            next[contact.id] = { lastTouch: null }
          }
        })
        setTouchInfo(next)
        setInteractionStats({ last7: totalLast7, last30: totalLast30 })
        if (results.some((item) => item.status === 'rejected')) {
          setTouchError(t('staleLoadInteractionsFailed'))
        }
      })
      .catch(() => {
        if (!cancelled) setTouchError(t('staleLoadInteractionsFailed'))
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
        setIntroError(detail || t('weekIntroLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setIntroLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiRequest])

  const cadenceConfig = useMemo(() => loadCadenceConfig(), [])

  const overdueRows = useMemo(() => {
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
      .slice(0, 10)
  }, [cadenceConfig, touchInfo, visibleContacts])

  const upcomingReminders = useMemo(() => {
    const now = Date.now()
    const end = now + 7 * dayMs
    return reminders
      .filter((reminder) => reminder.status === 'open')
      .filter((reminder) => {
        const due = new Date(reminder.due_at).getTime()
        return Number.isFinite(due) && due >= now && due <= end
      })
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
      .slice(0, 10)
  }, [reminders])

  const activeIntroductions = useMemo(() => {
    const excluded = new Set(['completed', 'canceled'])
    return introductions.filter((item) => !excluded.has(item.status)).slice(0, 10)
  }, [introductions])

  const actionQueue = useMemo(() => {
    const reminderItems = upcomingReminders.map((reminder) => {
      const contact = reminder.contact_id ? contactById[reminder.contact_id] : null
      return {
        kind: 'reminder' as const,
        id: reminder.id,
        title: reminder.title || t('remindersUntitled'),
        contact,
        reminder,
        sortKey: new Date(reminder.due_at).getTime(),
      }
    })
    const overdueItems = overdueRows.map((row) => ({
      kind: 'overdue' as const,
      id: row.contact.id,
      title: row.contact.display_name,
      contact: row.contact,
      overdueDays: row.overdueDays ?? null,
      sortKey: row.nextDueDate ? row.nextDueDate.getTime() : 0,
    }))
    return [...reminderItems, ...overdueItems].sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0))
  }, [upcomingReminders, overdueRows, contactById])

  const newContactsCount = useMemo(() => {
    const since = Date.now() - 30 * dayMs
    return visibleContacts.filter((contact) => new Date(contact.created_at).getTime() >= since).length
  }, [visibleContacts])

  const tierLabel = (tier: CadenceTier | null) => {
    if (tier === 'A') return t('contactTierA')
    if (tier === 'B') return t('contactTierB')
    if (tier === 'C') return t('contactTierC')
    return t('contactTierNone')
  }

  const handleCloseReminder = async (reminderId: string) => {
    setClosingReminderId(reminderId)
    try {
      await apiRequest(`/api/v1/reminders/${reminderId}`, { method: 'PATCH', body: { status: 'done' } })
      onRefreshReminders()
      toast.success(t('toastSaved'))
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('toastActionFailed')}: ${detail}` : t('toastActionFailed')
      toast.error(message)
    } finally {
      setClosingReminderId(null)
    }
  }

  const openFollowUpModal = (contact: Contact) => {
    setFollowUpContact(contact)
    setFollowUpDate(toLocalInputValue(new Date(Date.now() + dayMs)))
  }

  const handleThank = (contact: Contact) => {
    const summary = `${t('weekThankMessagePrefix')} ${contact.display_name}${t('weekThankMessageSuffix')}`
    const params = new URLSearchParams({
      action: 'interaction',
      tab: 'timeline',
      interaction_type: 'message',
      interaction_summary: summary,
    })
    navigate(`/contacts/${contact.id}?${params.toString()}`)
  }

  const handleCreateFollowUp = async () => {
    if (!followUpContact) return
    const due = new Date(followUpDate)
    if (!followUpDate || Number.isNaN(due.getTime())) {
      toast.error(t('toastActionFailed'))
      return
    }
    setFollowUpSaving(true)
    try {
      await apiRequest('/api/v1/reminders', {
        method: 'POST',
        body: {
          contact_id: followUpContact.id,
          type: 'follow_up',
          title: `${t('weekFollowUpTitlePrefix')} ${followUpContact.display_name}`,
          due_at: due.toISOString(),
        },
      })
      toast.success(t('toastSaved'))
      onRefreshReminders()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('toastActionFailed')}: ${detail}` : t('toastActionFailed')
      toast.error(message)
    } finally {
      setFollowUpSaving(false)
    }
  }

  return (
    <section style={{ marginTop: 16, display: 'grid', gap: 20 }} data-testid="weekly-dashboard">
      <h2>{t('weekPanelTitle')}</h2>

      <div style={{ display: 'grid', gap: 12 }} data-testid="overdue-list">
        <div style={{ fontWeight: 600 }}>{t('weekBlockOverdue')}</div>
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
        {touchLoading && <Alert type="info">{t('weekTouchLoading')}</Alert>}
        {touchError && <Alert type="error">{touchError}</Alert>}
        {!contactsLoading && overdueRows.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('weekOverdueEmpty')}</div>
        )}
        {overdueRows.map((row) => (
          <div
            key={row.contact.id}
            data-testid={`overdue-item-${row.contact.id}`}
            style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{row.contact.display_name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {t('contactTierLabel')}: {tierLabel(row.tier)} • {t('staleCadenceLabel')}:{' '}
                  {row.cadenceDays ? `${row.cadenceDays} ${t('staleCadenceDays')}` : t('staleCadenceMissing')}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#b00020' }}>
                {t('staleStatusOverdue')} • {t('staleOverduePrefix')} {row.overdueDays} {t('staleOverdueSuffix')}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#444' }}>
              {t('staleLastTouchLabel')}: {row.lastTouchDate ? row.lastTouchDate.toLocaleDateString() : t('staleNoTouches')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                onClick={() => navigate(`/contacts/${row.contact.id}?action=interaction&tab=timeline`)}
              >
                {t('weekActionInteraction')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/contacts/${row.contact.id}?action=reminder`)}
              >
                {t('weekActionReminder')}
              </Button>
              <Button variant="secondary" onClick={() => handleThank(row.contact)}>
                {t('weekActionThanks')}
              </Button>
              <Button variant="secondary" onClick={() => openFollowUpModal(row.contact)}>
                {t('weekActionFollowUp')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12 }} data-testid="upcoming-reminders">
        <div style={{ fontWeight: 600 }}>{t('weekBlockUpcoming')}</div>
        {remindersLoading && <Alert type="info">{t('remindersLoading')}</Alert>}
        {reminderError && <Alert type="error">{reminderError}</Alert>}
        {!remindersLoading && upcomingReminders.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('weekUpcomingEmpty')}</div>
        )}
        {upcomingReminders.map((reminder) => {
          const contact = reminder.contact_id ? contactById[reminder.contact_id] : null
          return (
            <div
              key={reminder.id}
              data-testid={`upcoming-reminder-${reminder.id}`}
              style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 600 }}>
                  {reminder.title || t('remindersUntitled')}
                  {contact ? ` • ${contact.display_name}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(reminder.due_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  onClick={() => handleCloseReminder(reminder.id)}
                  loading={closingReminderId === reminder.id}
                  loadingLabel={t('weekReminderClosing')}
                  dataTestId="reminder-done"
                >
                  {t('weekActionReminderClose')}
                </Button>
                {contact && (
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/contacts/${contact.id}?action=interaction&tab=timeline`)}
                  >
                    {t('weekActionInteraction')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gap: 12 }} data-testid="action-queue">
        <div style={{ fontWeight: 600 }}>{t('weekAnalyticsTitle')}</div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekAnalyticsInteractions')}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }} data-testid="metrics-interactions">
              {interactionStats.last7} / {interactionStats.last30}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekAnalyticsInteractionsHint')}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekAnalyticsNewContacts')}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }} data-testid="metrics-new-contacts">
              {newContactsCount}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekAnalyticsLast30')}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekAnalyticsIntroductions')}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }} data-testid="metrics-introductions">
              {activeIntroductions.length}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>{t('weekIntroStatus')}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }} data-testid="intros-in-progress">
        <div style={{ fontWeight: 600 }}>{t('weekQueueTitle')}</div>
        {actionQueue.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('weekQueueEmpty')}</div>
        )}
        {actionQueue.map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            data-testid={`queue-item-${item.kind}-${item.id}`}
            style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 600 }}>
                {item.kind === 'reminder' ? t('weekQueueReminderLabel') : t('weekQueueOverdueLabel')}:{' '}
                {item.title}
                {item.contact ? ` • ${item.contact.display_name}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {item.kind === 'reminder' && item.reminder ? new Date(item.reminder.due_at).toLocaleDateString() : ''}
                {item.kind === 'overdue' && item.overdueDays !== null
                  ? `${t('staleOverduePrefix')} ${item.overdueDays} ${t('staleOverdueSuffix')}`
                  : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {item.kind === 'reminder' && item.reminder ? (
                <Button
                  variant="secondary"
                  onClick={() => handleCloseReminder(item.reminder!.id)}
                  loading={closingReminderId === item.reminder!.id}
                  loadingLabel={t('weekReminderClosing')}
                  dataTestId="reminder-done"
                >
                  {t('weekQueueDone')}
                </Button>
              ) : item.contact ? (
                <Button
                  variant="secondary"
                  onClick={() => setOverdueActionContact(item.contact!)}
                  dataTestId="queue-overdue-done"
                >
                  {t('weekQueueDone')}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 600 }}>{t('weekBlockIntroductions')}</div>
        {introLoading && <Alert type="info">{t('weekIntroLoading')}</Alert>}
        {introError && <Alert type="error">{introError}</Alert>}
        {!introLoading && activeIntroductions.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('weekIntroEmpty')}</div>
        )}
        {activeIntroductions.map((intro) => {
          const requester = contactById[intro.requester_contact_id]?.display_name
          const introducer = contactById[intro.introducer_contact_id]?.display_name
          const target = contactById[intro.target_contact_id]?.display_name
          return (
            <div
              key={intro.id}
              data-testid={`intro-in-progress-${intro.id}`}
              style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 600 }}>{t('weekIntroStatus')}: {intro.status}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(intro.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ fontSize: 13, color: '#444' }}>
                {t('weekIntroParticipants')}: {requester || t('weekIntroUnknown')}, {introducer || t('weekIntroUnknown')},{' '}
                {target || t('weekIntroUnknown')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => navigate('/introductions')}>
                  {t('weekActionOpenIntro')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {followUpContact && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 style={{ marginTop: 0 }}>{t('weekFollowUpTitle')}</h3>
              <Button variant="secondary" onClick={() => setFollowUpContact(null)}>
                {t('weekFollowUpCancel')}
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#666' }}>
                {t('weekFollowUpContactLabel')}: {followUpContact.display_name}
              </div>
              <TextField
                label={t('weekFollowUpDateLabel')}
                value={followUpDate}
                onChange={setFollowUpDate}
                type="datetime-local"
              />
              <div style={{ fontSize: 13, color: '#666' }}>{t('weekFollowUpInteractionPrompt')}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const params = new URLSearchParams({
                      action: 'interaction',
                      tab: 'timeline',
                      interaction_type: 'message',
                      interaction_summary: `${t('weekFollowUpInteractionPrefix')} ${followUpContact.display_name}`,
                    })
                    setFollowUpContact(null)
                    navigate(`/contacts/${followUpContact.id}?${params.toString()}`)
                  }}
                >
                  {t('weekFollowUpInteractionAction')}
                </Button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setFollowUpContact(null)}>
                  {t('weekFollowUpCancel')}
                </Button>
                <Button
                  onClick={handleCreateFollowUp}
                  loading={followUpSaving}
                  loadingLabel={t('weekFollowUpSaving')}
                >
                  {t('weekFollowUpCreate')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {overdueActionContact && (
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
            <h3 style={{ marginTop: 0 }}>{t('weekQueueOverdueTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: '#666' }}>
                {t('weekQueueOverdueText')} {overdueActionContact.display_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setOverdueActionContact(null)}>
                  {t('weekQueueCancel')}
                </Button>
                <Button
                  onClick={() => {
                    const params = new URLSearchParams({
                      action: 'interaction',
                      tab: 'timeline',
                      interaction_type: 'message',
                      interaction_summary: `${t('weekQueueOverdueInteractionPrefix')} ${overdueActionContact.display_name}`,
                    })
                    setOverdueActionContact(null)
                    navigate(`/contacts/${overdueActionContact.id}?${params.toString()}`)
                  }}
                >
                  {t('weekQueueCreateInteraction')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
