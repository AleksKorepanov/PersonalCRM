import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
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
    } finally {
      setClosingReminderId(null)
    }
  }

  return (
    <section style={{ marginTop: 16, display: 'grid', gap: 20 }}>
      <h2>{t('weekPanelTitle')}</h2>

      <div style={{ display: 'grid', gap: 12 }}>
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
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
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
    </section>
  )
}
