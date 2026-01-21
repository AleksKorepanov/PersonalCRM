import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import type { Contact, Interaction, Reminder } from '../types'

type ContactCardPageProps = {
  role: 'owner' | 'assistant'
  loadContact: (contactId: string) => Promise<Contact | null>
  updateContact: (contactId: string, payload: Record<string, unknown>) => Promise<Contact | null>
  loadInteractions: (contactId: string) => Promise<Interaction[]>
  createInteraction: (
    contactId: string,
    payload: {
      type: string
      occurred_at: string
      summary?: string
      next_action?: string
    },
  ) => Promise<void>
  createReminder: (
    contactId: string,
    payload: {
      title?: string
      body?: string
      due_at: string
    },
  ) => Promise<void>
  onReminderCreated: () => void
  createIntroduction: (payload: {
    requester_contact_id: string
    introducer_contact_id: string
    target_contact_id: string
    ask: string
    benefit_for_requester?: string
    benefit_for_target?: string
    status?: string
  }) => Promise<void>
  searchContacts: (query: string) => Promise<Contact[]>
  loadRemindersForContact: (contactId: string) => Promise<Reminder[]>
}

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

export default function ContactCardPage({
  role,
  loadContact,
  updateContact,
  loadInteractions,
  createInteraction,
  createReminder,
  onReminderCreated,
  createIntroduction,
  searchContacts,
  loadRemindersForContact,
}: ContactCardPageProps) {
  const { contactId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contact, setContact] = useState<Contact | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    displayName: '',
    emails: '',
    phones: '',
    messengers: '',
    jobTitle: '',
    industries: '',
    competencies: '',
    metContext: '',
    sharedNotes: '',
    privateNotes: '',
    visibility: 'shared',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Interaction[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [lastInteraction, setLastInteraction] = useState<Interaction | null>(null)
  const [nextReminder, setNextReminder] = useState<Reminder | null>(null)
  const formatTimelineError = (err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err)
    return import.meta.env.DEV ? `${t('timelineLoadFailed')} ${t('timelineLoadFailedDetails')} ${detail}` : t('timelineLoadFailed')
  }

  const [timelineSuccess, setTimelineSuccess] = useState<string | null>(null)
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [interactionSubmitting, setInteractionSubmitting] = useState(false)
  const [interactionErrors, setInteractionErrors] = useState<{ type?: string; occurredAt?: string }>({})
  const [interactionSaveError, setInteractionSaveError] = useState<string | null>(null)
  const [interactionForm, setInteractionForm] = useState({
    type: 'meeting',
    occurredAt: toLocalInputValue(new Date()),
    summary: '',
    nextAction: '',
  })
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [reminderSubmitting, setReminderSubmitting] = useState(false)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [reminderSuccess, setReminderSuccess] = useState<string | null>(null)
  const [reminderForm, setReminderForm] = useState({
    title: '',
    dueAt: toLocalInputValue(new Date()),
    body: '',
  })
  const [introductionModalOpen, setIntroductionModalOpen] = useState(false)
  const [introductionSubmitting, setIntroductionSubmitting] = useState(false)
  const [introductionError, setIntroductionError] = useState<string | null>(null)
  const [introductionSuccess, setIntroductionSuccess] = useState<string | null>(null)
  const [contactSearchQuery, setContactSearchQuery] = useState('')
  const [contactSearchResults, setContactSearchResults] = useState<Contact[]>([])
  const [selectedTargetName, setSelectedTargetName] = useState('')
  const [introductionForm, setIntroductionForm] = useState({
    targetContactId: '',
    ask: '',
    criteria: '',
    message: '',
  })
  const [timelineTypes, setTimelineTypes] = useState<string[]>([])
  const [timelinePeriod, setTimelinePeriod] = useState('30')

  const tabs = useMemo(
    () => [
      { key: 'profile', label: t('contactTabProfile') },
      { key: 'timeline', label: t('contactTabTimeline') },
      { key: 'introductions', label: t('contactTabIntroductions') },
      { key: 'projects', label: t('contactTabProjects') },
      { key: 'files', label: t('contactTabFiles') },
    ],
    [],
  )

  const tabParam = searchParams.get('tab') || 'profile'
  const activeTab = tabs.some((tab) => tab.key === tabParam) ? tabParam : 'profile'

  useEffect(() => {
    if (tabParam !== activeTab) {
      const next = new URLSearchParams(searchParams)
      next.set('tab', activeTab)
      setSearchParams(next, { replace: true })
    }
  }, [activeTab, tabParam, searchParams, setSearchParams])

  useEffect(() => {
    if (!contactId) return
    setLoading(true)
    setError(null)
    loadContact(contactId)
      .then((result) => setContact(result))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [contactId, loadContact])

  useEffect(() => {
    if (!contactId) return
    Promise.all([loadInteractions(contactId), loadRemindersForContact(contactId)])
      .then(([items, reminders]) => {
        const sortedInteractions = [...items].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        )
        setLastInteraction(sortedInteractions[0] || null)
        const sortedReminders = [...reminders]
          .filter((item) => item.due_at)
          .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        setNextReminder(sortedReminders[0] || null)
      })
      .catch(() => {
        setLastInteraction(null)
        setNextReminder(null)
      })
  }, [contactId, loadInteractions, loadRemindersForContact])

  useEffect(() => {
    if (!contactId || activeTab !== 'timeline') return
    setTimelineSuccess(null)
    setTimelineLoading(true)
    setTimelineError(null)
    loadInteractions(contactId)
      .then((items) => {
        setTimeline(items)
        setTimelineError(null)
      })
      .catch((err) => setTimelineError(formatTimelineError(err)))
      .finally(() => setTimelineLoading(false))
  }, [activeTab, contactId, loadInteractions])

  useEffect(() => {
    if (!introductionModalOpen) return
    const timeout = window.setTimeout(() => {
      const query = contactSearchQuery.trim()
      if (!query) {
        setContactSearchResults([])
        return
      }
      searchContacts(query)
        .then((items) => setContactSearchResults(items))
        .catch(() => setContactSearchResults([]))
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [contactSearchQuery, introductionModalOpen, searchContacts])

  const openInteractionModal = () => {
    setInteractionForm({
      type: 'meeting',
      occurredAt: toLocalInputValue(new Date()),
      summary: '',
      nextAction: '',
    })
    setInteractionErrors({})
    setInteractionSaveError(null)
    setInteractionModalOpen(true)
  }

  const openReminderModal = () => {
    const defaultTitle = contact ? `${t('remindersDefaultTitlePrefix')} ${contact.display_name}` : ''
    setReminderForm({
      title: defaultTitle,
      dueAt: toLocalInputValue(new Date()),
      body: '',
    })
    setReminderError(null)
    setReminderModalOpen(true)
  }

  const openIntroductionModal = () => {
    setContactSearchQuery('')
    setContactSearchResults([])
    setSelectedTargetName('')
    setIntroductionForm({
      targetContactId: '',
      ask: '',
      criteria: '',
      message: '',
    })
    setIntroductionError(null)
    setIntroductionModalOpen(true)
  }

  const saveInteraction = async () => {
    if (!contactId) return
    const errors: { type?: string; occurredAt?: string } = {}
    if (!interactionForm.type) {
      errors.type = t('timelineValidationType')
    }
    if (!interactionForm.occurredAt) {
      errors.occurredAt = t('timelineValidationDate')
    }
    const occurredAtDate = new Date(interactionForm.occurredAt)
    if (!interactionForm.occurredAt || Number.isNaN(occurredAtDate.getTime())) {
      errors.occurredAt = t('timelineValidationDate')
    }
    setInteractionErrors(errors)
    if (Object.keys(errors).length > 0) return

    setInteractionSubmitting(true)
    setInteractionSaveError(null)
    try {
      await createInteraction(contactId, {
        type: interactionForm.type,
        occurred_at: occurredAtDate.toISOString(),
        summary: interactionForm.summary.trim() || undefined,
        next_action: interactionForm.nextAction.trim() || undefined,
      })
      const next = new URLSearchParams(searchParams)
      next.set('tab', 'timeline')
      setSearchParams(next)
      setInteractionModalOpen(false)
      setTimelineSuccess(t('timelineAddSuccess'))
      const items = await loadInteractions(contactId)
      setTimeline(items)
    } catch {
      setInteractionSaveError(t('timelineSaveFailed'))
    } finally {
      setInteractionSubmitting(false)
    }
  }

  const saveReminder = async () => {
    if (!contactId) return
    const dueDate = new Date(reminderForm.dueAt)
    if (!reminderForm.dueAt || Number.isNaN(dueDate.getTime())) {
      setReminderError(t('remindersValidationDate'))
      return
    }
    setReminderSubmitting(true)
    setReminderError(null)
    try {
      await createReminder(contactId, {
        title: reminderForm.title.trim() || undefined,
        body: reminderForm.body.trim() || undefined,
        due_at: dueDate.toISOString(),
      })
      setReminderModalOpen(false)
      setReminderSuccess(t('remindersCreated'))
      onReminderCreated()
    } catch {
      setReminderError(t('remindersSaveFailed'))
    } finally {
      setReminderSubmitting(false)
    }
  }

  const saveIntroduction = async () => {
    if (!contact) return
    if (!introductionForm.targetContactId) {
      setIntroductionError(t('introductionsValidationTarget'))
      return
    }
    if (!introductionForm.ask.trim()) {
      setIntroductionError(t('introductionsValidationGoal'))
      return
    }
    setIntroductionSubmitting(true)
    setIntroductionError(null)
    try {
      await createIntroduction({
        requester_contact_id: contact.id,
        introducer_contact_id: contact.id,
        target_contact_id: introductionForm.targetContactId,
        ask: introductionForm.ask.trim(),
        benefit_for_requester: introductionForm.criteria.trim() || undefined,
        benefit_for_target: introductionForm.message.trim() || undefined,
      })
      setIntroductionModalOpen(false)
      setIntroductionSuccess(t('introductionsCreated'))
    } catch {
      setIntroductionError(t('introductionsSaveFailed'))
    } finally {
      setIntroductionSubmitting(false)
    }
  }

  const company = contact?.organization?.name || contact?.company || contact?.company_name
  const tags = contact?.tags || []
  const competencies = contact?.competencies || []
  const industries = contact?.industries || []
  const messengers = contact?.messengers || {}
  const metContext = contact?.met_context
  const notes = contact?.shared_notes || contact?.private_notes
  const privacy = contact?.visibility
  const isLimitedForAssistant = privacy === 'limited' && role === 'assistant'

  const formatList = (items: string[]) => (items.length > 0 ? items.join(', ') : t('contactNotSet'))
  const formatMessenger = () => {
    const entries = Object.entries(messengers)
    if (entries.length === 0) return t('contactNotSet')
    return entries.map(([key, value]) => `${key}: ${value}`).join(', ')
  }

  const formatInteractionType = (value: string) => {
    switch (value) {
      case 'meeting':
        return t('timelineTypeMeeting')
      case 'call':
        return t('timelineTypeCall')
      case 'message':
        return t('timelineTypeMessage')
      case 'event':
        return t('timelineTypeEvent')
      case 'intro':
        return t('timelineTypeIntro')
      case 'help_given':
        return t('timelineTypeHelpGiven')
      case 'help_received':
        return t('timelineTypeHelpReceived')
      case 'note':
        return t('timelineTypeNote')
      default:
        return value
    }
  }

  const parseListInput = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

  const parseMessengers = (value: string) => {
    const result: Record<string, string> = {}
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const [key, ...rest] = entry.split(':')
        const valuePart = rest.join(':').trim()
        const keyPart = key?.trim()
        if (keyPart && valuePart) {
          result[keyPart] = valuePart
        }
      })
    return result
  }

  const buildEditForm = (data: Contact) => ({
    displayName: data.display_name || '',
    emails: (data.emails || []).join(', '),
    phones: (data.phones || []).join(', '),
    messengers: Object.entries(data.messengers || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(', '),
    jobTitle: data.job_title || '',
    industries: (data.industries || []).join(', '),
    competencies: (data.competencies || []).join(', '),
    metContext: data.met_context || '',
    sharedNotes: data.shared_notes || '',
    privateNotes: data.private_notes || '',
    visibility: data.visibility || 'shared',
  })

  const privacyLabel =
    privacy === 'private'
      ? t('contactPrivacyPrivate')
      : privacy === 'shared'
        ? t('contactPrivacyShared')
        : privacy === 'limited'
          ? t('contactPrivacyLimited')
          : t('contactNotSet')

  const filteredTimeline = useMemo(() => {
    const now = Date.now()
    const days = Number(timelinePeriod) || 30
    const windowMs = days * 24 * 60 * 60 * 1000
    return timeline.filter((item) => {
      const matchType = timelineTypes.length === 0 || timelineTypes.includes(item.type)
      const occurredAt = new Date(item.occurred_at).getTime()
      const matchPeriod = Number.isFinite(occurredAt) ? now - occurredAt <= windowMs : true
      return matchType && matchPeriod
    })
  }, [timeline, timelinePeriod, timelineTypes])

  const nextActionText = nextReminder
    ? `${t('contactHeaderActionContactBy')} ${new Date(nextReminder.due_at).toLocaleString()}`
    : t('contactHeaderActionAddInteraction')

  return (
    <section style={{ marginTop: 16 }}>
      <Link to="/contacts" style={{ textDecoration: 'none', color: '#1f5eff' }}>
        {t('contactBackToList')}
      </Link>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ marginBottom: 6 }}>{t('contactCardTitle')}</h2>
          {contact &&
            (isEditing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false)
                    setEditError(null)
                    setEditSuccess(null)
                  }}
                >
                  {t('contactEditCancel')}
                </Button>
                <Button
                  onClick={async () => {
                    if (!contact) return
                    if (!editForm.displayName.trim()) {
                      setEditError(t('contactEditNameRequired'))
                      return
                    }
                    setEditSubmitting(true)
                    setEditError(null)
                    setEditSuccess(null)
                    try {
                      const payload: Record<string, unknown> = {
                        display_name: editForm.displayName.trim(),
                        emails: parseListInput(editForm.emails),
                        phones: parseListInput(editForm.phones),
                        messengers: parseMessengers(editForm.messengers),
                        job_title: editForm.jobTitle.trim() || null,
                        industries: parseListInput(editForm.industries),
                        competencies: parseListInput(editForm.competencies),
                        met_context: editForm.metContext.trim() || null,
                        visibility: editForm.visibility,
                      }
                      if (!isLimitedForAssistant) {
                        payload.shared_notes = editForm.sharedNotes.trim() || null
                        payload.private_notes = editForm.privateNotes.trim() || null
                      }
                      const updated = await updateContact(contact.id, payload)
                      if (updated) {
                        setContact(updated)
                        setEditSuccess(t('contactEditSuccess'))
                        setIsEditing(false)
                      }
                    } catch (err) {
                      const detail = err instanceof Error ? err.message : String(err)
                      setEditError(
                        import.meta.env.DEV
                          ? `${t('contactEditError')} ${t('contactCreateErrorDetails')} ${detail}`
                          : t('contactEditError'),
                      )
                    } finally {
                      setEditSubmitting(false)
                    }
                  }}
                  loading={editSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                >
                  {t('contactEditSave')}
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  if (!contact) return
                  setEditForm(buildEditForm(contact))
                  setEditError(null)
                  setEditSuccess(null)
                  setIsEditing(true)
                }}
              >
                {t('contactEditButton')}
              </Button>
            ))}
        </div>
        {loading && <Alert type="info">{t('contactsLoading')}</Alert>}
        {error && <Alert type="error">{t('contactsLoadFailed')}</Alert>}
        {!loading && !contact && !error && <Alert type="info">{t('timelineContactMissing')}</Alert>}
        {reminderSuccess && <Alert type="success">{reminderSuccess}</Alert>}
        {introductionSuccess && <Alert type="success">{introductionSuccess}</Alert>}
        {editSuccess && <Alert type="success">{editSuccess}</Alert>}
        {editError && <Alert type="error">{editError}</Alert>}
      </div>

      {contact && (
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('contactHeaderLastInteraction')}</div>
              {lastInteraction ? (
                <div style={{ fontSize: 14 }}>
                  <div style={{ color: '#666' }}>{new Date(lastInteraction.occurred_at).toLocaleString()}</div>
                  <div>{formatInteractionType(lastInteraction.type)}</div>
                  {lastInteraction.summary && <div>{lastInteraction.summary}</div>}
                </div>
              ) : (
                <div style={{ color: '#666' }}>{t('contactHeaderNoInteractions')}</div>
              )}
            </div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('contactHeaderNextReminder')}</div>
              {nextReminder ? (
                <div style={{ fontSize: 14 }}>
                  <div style={{ color: '#666' }}>{new Date(nextReminder.due_at).toLocaleString()}</div>
                  <div>{nextReminder.title || t('remindersUntitled')}</div>
                </div>
              ) : (
                <div style={{ color: '#666' }}>{t('contactHeaderNoReminders')}</div>
              )}
            </div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('contactHeaderNextAction')}</div>
              <div style={{ fontSize: 14 }}>{nextActionText}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.set('tab', tab.key)
                    setSearchParams(next)
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: isActive ? '#1f5eff' : '#e5e7eb',
                    background: isActive ? '#eef4ff' : '#fff',
                    color: isActive ? '#1f5eff' : '#333',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {activeTab === 'profile' ? (
            <div style={{ display: 'grid', gap: 16 }}>
              {isLimitedForAssistant && (
                <Alert type="info">{t('contactLimitedNotice')}</Alert>
              )}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  display: 'grid',
                  gap: 16,
                }}
              >
                <div>
                  {isEditing ? (
                    <TextField
                      label={t('contactsFieldNameLabel')}
                      value={editForm.displayName}
                      onChange={(value) => setEditForm((prev) => ({ ...prev, displayName: value }))}
                    />
                  ) : (
                    <div style={{ fontSize: 22, fontWeight: 600 }}>{contact.display_name}</div>
                  )}
                  {company && (
                    <div style={{ marginTop: 4, color: '#666' }}>
                      {t('contactCompanyLabel')}: {company}
                    </div>
                  )}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{t('contactTagsLabel')}</div>
                    {tags.length === 0 ? (
                      <div style={{ color: '#666' }}>{t('contactNotSet')}</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 12,
                              background: '#f3f4f6',
                              fontSize: 12,
                              color: '#333',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#666' }}>{t('contactQuickActionsLabel')}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="secondary" onClick={openInteractionModal}>
                      {t('contactActionAddInteraction')}
                    </Button>
                    <Button variant="secondary" onClick={openReminderModal}>
                      {t('contactActionSetReminder')}
                    </Button>
                    <Button variant="secondary" onClick={openIntroductionModal}>
                      {t('contactActionCreateIntroduction')}
                    </Button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('contactSectionMain')}</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactPhonesLabel')}
                          value={editForm.phones}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, phones: value }))}
                        />
                      ) : (
                        <>
                          {t('contactPhonesLabel')}: {formatList(contact.phones || [])}
                        </>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactEmailsLabel')}
                          value={editForm.emails}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, emails: value }))}
                        />
                      ) : (
                        <>
                          {t('contactEmailsLabel')}: {formatList(contact.emails || [])}
                        </>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactMessengersLabel')}
                          value={editForm.messengers}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, messengers: value }))}
                        />
                      ) : (
                        <>
                          {t('contactMessengersLabel')}: {formatMessenger()}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('contactSectionProfessional')}</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactJobTitleLabel')}
                          value={editForm.jobTitle}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, jobTitle: value }))}
                        />
                      ) : (
                        <>
                          {t('contactJobTitleLabel')}: {contact.job_title || t('contactNotSet')}
                        </>
                      )}
                    </div>
                    <div>
                      {t('contactCompanyLabel')}: {company || t('contactNotSet')}
                    </div>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactIndustryLabel')}
                          value={editForm.industries}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, industries: value }))}
                        />
                      ) : (
                        <>
                          {t('contactIndustryLabel')}: {formatList(industries)}
                        </>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactSkillsLabel')}
                          value={editForm.competencies}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, competencies: value }))}
                        />
                      ) : (
                        <>
                          {t('contactSkillsLabel')}: {formatList([...competencies, ...tags])}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('contactSectionContext')}</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                    <div>
                      {isEditing ? (
                        <TextField
                          label={t('contactMetContextLabel')}
                          value={editForm.metContext}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, metContext: value }))}
                        />
                      ) : (
                        <>
                          {t('contactMetContextLabel')}: {metContext || t('contactNotSet')}
                        </>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        isLimitedForAssistant ? (
                          <>
                            {t('contactNotesLabel')}: {t('valueHidden')}
                          </>
                        ) : (
                          <TextField
                            label={t('contactNotesLabel')}
                            value={editForm.sharedNotes}
                            onChange={(value) => setEditForm((prev) => ({ ...prev, sharedNotes: value }))}
                          />
                        )
                      ) : (
                        <>
                          {t('contactNotesLabel')}: {isLimitedForAssistant ? t('valueHidden') : notes || t('contactNotSet')}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('contactSectionPrivacy')}</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                    <div>
                      {isEditing ? (
                        <Select
                          label={t('contactPrivacyLabel')}
                          value={editForm.visibility}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, visibility: value }))}
                          options={[
                            { value: 'shared', label: t('contactPrivacyShared') },
                            { value: 'limited', label: t('contactPrivacyLimited') },
                            { value: 'private', label: t('contactPrivacyPrivate') },
                          ]}
                        />
                      ) : (
                        <>
                          {t('contactPrivacyLabel')}: {privacyLabel}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'timeline' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600 }}>{t('contactTabTimeline')}</div>
                <Button onClick={openInteractionModal}>{t('contactActionAddInteraction')}</Button>
              </div>
              <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600 }}>{t('timelineFiltersTitle')}</div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, color: '#333' }}>{t('timelineFilterTypes')}</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {[
                        { value: 'meeting', label: t('timelineTypeMeeting') },
                        { value: 'call', label: t('timelineTypeCall') },
                        { value: 'message', label: t('timelineTypeMessage') },
                        { value: 'event', label: t('timelineTypeEvent') },
                      ].map((option) => (
                        <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={timelineTypes.includes(option.value)}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setTimelineTypes((prev) => [...prev, option.value])
                              } else {
                                setTimelineTypes((prev) => prev.filter((item) => item !== option.value))
                              }
                            }}
                          />
                          <span style={{ fontSize: 14 }}>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Select
                    label={t('timelineFilterPeriod')}
                    value={timelinePeriod}
                    onChange={setTimelinePeriod}
                    options={[
                      { value: '7', label: t('timelinePeriod7') },
                      { value: '30', label: t('timelinePeriod30') },
                      { value: '90', label: t('timelinePeriod90') },
                    ]}
                  />
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {t('timelineShown')}: {filteredTimeline.length}
                </div>
              </div>
              {timelineLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
              {timelineError && (
                <Alert type="error">
                  {timelineError}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!contactId) return
                        setTimelineSuccess(null)
                        setTimelineLoading(true)
                        setTimelineError(null)
                        loadInteractions(contactId)
                          .then((items) => {
                            setTimeline(items)
                            setTimelineError(null)
                          })
                          .catch((err) => setTimelineError(formatTimelineError(err)))
                          .finally(() => setTimelineLoading(false))
                      }}
                    >
                      {t('timelineRetry')}
                    </Button>
                  </div>
                </Alert>
              )}
              {!timelineLoading && !timelineError && filteredTimeline.length === 0 && (
                <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('timelineEmpty')}</div>
              )}
              {timelineSuccess && <Alert type="success">{timelineSuccess}</Alert>}
              {!timelineLoading && !timelineError && filteredTimeline.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {[...filteredTimeline]
                    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
                    .map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        display: 'grid',
                        gap: 6,
                        fontSize: 14,
                      }}
                    >
                      <div style={{ color: '#666' }}>
                        {new Date(item.occurred_at).toLocaleString()} • {formatInteractionType(item.type)}
                      </div>
                      {item.summary && <div>{item.summary}</div>}
                      {item.outcome && (
                        <div>
                          {t('timelineItemOutcome')}: {item.outcome}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Alert type="info">{t('contactTabSoon')}</Alert>
          )}
        </div>
      )}

      {interactionModalOpen && (
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
            <h3 style={{ marginTop: 0 }}>{t('timelineAddTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <Select
                label={t('timelineFieldType')}
                value={interactionForm.type}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, type: value }))}
                error={interactionErrors.type}
                options={[
                  { value: 'meeting', label: t('timelineTypeMeeting') },
                  { value: 'call', label: t('timelineTypeCall') },
                  { value: 'message', label: t('timelineTypeMessage') },
                  { value: 'event', label: t('timelineTypeEvent') },
                ]}
              />
              <TextField
                label={t('timelineFieldOccurredAt')}
                value={interactionForm.occurredAt}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, occurredAt: value }))}
                error={interactionErrors.occurredAt}
                type="datetime-local"
              />
              <TextField
                label={t('timelineFieldSummary')}
                value={interactionForm.summary}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, summary: value }))}
              />
              <TextField
                label={t('timelineFieldNextAction')}
                value={interactionForm.nextAction}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, nextAction: value }))}
              />
              {interactionSaveError && <Alert type="error">{interactionSaveError}</Alert>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setInteractionModalOpen(false)}>
                  {t('timelineCancel')}
                </Button>
                <Button
                  onClick={saveInteraction}
                  loading={interactionSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                >
                  {t('timelineSave')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reminderModalOpen && (
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
            <h3 style={{ marginTop: 0 }}>{t('remindersNewTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <TextField
                label={t('remindersTitleLabel')}
                value={reminderForm.title}
                onChange={(value) => setReminderForm((prev) => ({ ...prev, title: value }))}
              />
              <TextField
                label={t('timelineFieldOccurredAt')}
                value={reminderForm.dueAt}
                onChange={(value) => setReminderForm((prev) => ({ ...prev, dueAt: value }))}
                type="datetime-local"
              />
              <TextField
                label={t('remindersCommentLabel')}
                value={reminderForm.body}
                onChange={(value) => setReminderForm((prev) => ({ ...prev, body: value }))}
              />
              {reminderError && <Alert type="error">{reminderError}</Alert>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setReminderModalOpen(false)}>
                  {t('remindersCancel')}
                </Button>
                <Button
                  onClick={saveReminder}
                  loading={reminderSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                >
                  {t('remindersSave')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {introductionModalOpen && (
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
              maxWidth: 560,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>{t('introductionsNewTitle')}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <TextField
                label={t('introductionsTargetLabel')}
                placeholder={t('introductionsTargetPlaceholder')}
                value={contactSearchQuery}
                onChange={(value) => {
                  setContactSearchQuery(value)
                  setIntroductionForm((prev) => ({ ...prev, targetContactId: '' }))
                  setSelectedTargetName('')
                }}
              />
              {selectedTargetName && (
                <div style={{ fontSize: 13, color: '#666' }}>
                  {t('introductionsSelectedLabel')}: {selectedTargetName}
                </div>
              )}
              {contactSearchResults.length > 0 && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                    {t('introductionsFoundLabel')}: {contactSearchResults.length}
                  </div>
                  {contactSearchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setIntroductionForm((prev) => ({ ...prev, targetContactId: item.id }))
                        setContactSearchQuery(item.display_name)
                        setSelectedTargetName(item.display_name)
                        setContactSearchResults([])
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      {item.display_name}
                    </button>
                  ))}
                </div>
              )}
              {contactSearchQuery.trim().length > 0 && contactSearchResults.length === 0 && (
                <div style={{ fontSize: 13, color: '#666' }}>{t('introductionsNoResults')}</div>
              )}
              <TextField
                label={t('introductionsGoalLabel')}
                value={introductionForm.ask}
                onChange={(value) => setIntroductionForm((prev) => ({ ...prev, ask: value }))}
              />
              <TextField
                label={t('introductionsCriteriaLabel')}
                value={introductionForm.criteria}
                onChange={(value) => setIntroductionForm((prev) => ({ ...prev, criteria: value }))}
              />
              <TextField
                label={t('introductionsMessageLabel')}
                value={introductionForm.message}
                onChange={(value) => setIntroductionForm((prev) => ({ ...prev, message: value }))}
              />
              {introductionError && <Alert type="error">{introductionError}</Alert>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setIntroductionModalOpen(false)}>
                  {t('introductionsCancel')}
                </Button>
                <Button
                  onClick={saveIntroduction}
                  loading={introductionSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                >
                  {t('introductionsSave')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
