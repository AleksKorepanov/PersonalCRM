import React, { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AssistantMessageModal from '../components/AssistantMessageModal'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import TextField from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { t } from '../i18n/t'
import type { AssistantMessageCreate, Contact, Interaction, Introduction, Reminder } from '../types'
import { applyTierToTags, loadCadenceConfig, parseTierFromTags, type CadenceTier } from '../utils/cadence'

type ContactCardPageProps = {
  role: 'owner' | 'assistant'
  loadContact: (contactId: string) => Promise<Contact | null>
  updateContact: (contactId: string, payload: Record<string, unknown>) => Promise<Contact | null>
  resolveOrganizationId: (name: string) => Promise<string | null>
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
  loadIntroductionsForContact: (contactId: string) => Promise<Introduction[]>
  createAssistantMessage: (payload: AssistantMessageCreate) => Promise<void>
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
  resolveOrganizationId,
  loadInteractions,
  createInteraction,
  createReminder,
  onReminderCreated,
  createIntroduction,
  searchContacts,
  loadRemindersForContact,
  loadIntroductionsForContact,
  createAssistantMessage,
}: ContactCardPageProps) {
  const navigate = useNavigate()
  const { contactId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [contact, setContact] = useState<Contact | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const toast = useToast()
  const [editForm, setEditForm] = useState({
    displayName: '',
    emails: '',
    phones: '',
    messengers: '',
    jobTitle: '',
    company: '',
    industries: '',
    competencies: '',
    metContext: '',
    sharedNotes: '',
    privateNotes: '',
    visibility: 'shared',
    tier: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Interaction[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [lastInteraction, setLastInteraction] = useState<Interaction | null>(null)
  const [nextReminder, setNextReminder] = useState<Reminder | null>(null)
  const [contactReminders, setContactReminders] = useState<Reminder[]>([])
  const [contactIntroductions, setContactIntroductions] = useState<Introduction[]>([])
  const formatTimelineError = (err: unknown) => {
    const detail = err instanceof Error ? err.message : String(err)
    return import.meta.env.DEV ? `${t('timelineLoadFailed')} ${t('timelineLoadFailedDetails')} ${detail}` : t('timelineLoadFailed')
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

  const buildTimelineCsv = (items: Interaction[]) => {
    const header = ['occurred_at', 'type', 'summary', 'outcome', 'next_action']
    const rows = items.map((item) => {
      const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
      return [
        item.occurred_at || '',
        item.type || '',
        item.summary || '',
        item.outcome || '',
        item.next_action || '',
      ]
        .map((value) => escape(String(value)))
        .join(',')
    })
    return [header.join(','), ...rows].join('\n')
  }

  const handleExportTimelineCsv = () => {
    const csv = buildTimelineCsv(filteredTimeline)
    downloadFile(csv, `timeline-${contactId || 'contact'}.csv`, 'text/csv;charset=utf-8')
  }

  const handleExportTimelineJson = () => {
    downloadFile(JSON.stringify(filteredTimeline, null, 2), `timeline-${contactId || 'contact'}.json`, 'application/json;charset=utf-8')
  }

  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [interactionSubmitting, setInteractionSubmitting] = useState(false)
  const [interactionErrors, setInteractionErrors] = useState<{ type?: string; occurredAt?: string }>({})
  const [interactionForm, setInteractionForm] = useState({
    type: 'meeting',
    occurredAt: toLocalInputValue(new Date()),
    summary: '',
    nextAction: '',
  })
  const [followUpPromptOpen, setFollowUpPromptOpen] = useState(false)
  const [followUpBaseDate, setFollowUpBaseDate] = useState<Date | null>(null)
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false)
  const [reminderModalOpen, setReminderModalOpen] = useState(false)
  const [reminderSubmitting, setReminderSubmitting] = useState(false)
  const [reminderForm, setReminderForm] = useState({
    title: '',
    dueAt: toLocalInputValue(new Date()),
    body: '',
  })
  const [introductionModalOpen, setIntroductionModalOpen] = useState(false)
  const [introductionSubmitting, setIntroductionSubmitting] = useState(false)
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
  const actionHandledRef = useRef(false)
  const [assistantModalOpen, setAssistantModalOpen] = useState(false)
  const [assistantSubmitting, setAssistantSubmitting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const exportRef = useRef<HTMLDivElement | null>(null)

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
    if (!contactId || !contact || actionHandledRef.current) return
    const action = searchParams.get('action')
    if (!action) return
    if (action === 'interaction') {
      const rawType = searchParams.get('interaction_type') || undefined
      const presetSummary = searchParams.get('interaction_summary') || undefined
      const presetNextAction = searchParams.get('interaction_next') || undefined
      openInteractionModal({
        type: rawType || undefined,
        summary: presetSummary || undefined,
        nextAction: presetNextAction || undefined,
      })
      actionHandledRef.current = true
      const next = new URLSearchParams(searchParams)
      next.delete('action')
      next.delete('interaction_type')
      next.delete('interaction_summary')
      next.delete('interaction_next')
      next.set('tab', 'timeline')
      setSearchParams(next, { replace: true })
      return
    }
    if (action === 'reminder') {
      openReminderModal()
      actionHandledRef.current = true
      const next = new URLSearchParams(searchParams)
      next.delete('action')
      setSearchParams(next, { replace: true })
    }
  }, [contact, contactId, searchParams, setSearchParams])

  useEffect(() => {
    if (!contactId) return
    Promise.all([loadInteractions(contactId), loadRemindersForContact(contactId), loadIntroductionsForContact(contactId)])
      .then(([items, reminders, introductions]) => {
        const sortedInteractions = [...items].sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        )
        setLastInteraction(sortedInteractions[0] || null)
        setContactReminders(reminders || [])
        const sortedReminders = [...(reminders || [])]
          .filter((item) => item.due_at)
          .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        setNextReminder(sortedReminders[0] || null)
        setContactIntroductions(introductions || [])
      })
      .catch(() => {
        setLastInteraction(null)
        setNextReminder(null)
        setContactReminders([])
        setContactIntroductions([])
      })
  }, [contactId, loadInteractions, loadRemindersForContact, loadIntroductionsForContact])

  useEffect(() => {
    if (!contactId || activeTab !== 'timeline') return
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

  const normalizeInteractionType = (value: string) => {
    const trimmed = value.trim()
    const allowed = new Set(['meeting', 'call', 'message', 'event', 'intro', 'help_given', 'help_received', 'note'])
    if (allowed.has(trimmed)) return trimmed
    const labelMap = new Map<string, string>([
      [t('timelineTypeMeeting'), 'meeting'],
      [t('timelineTypeCall'), 'call'],
      [t('timelineTypeMessage'), 'message'],
      [t('timelineTypeEvent'), 'event'],
      [t('timelineTypeIntro'), 'intro'],
      [t('timelineTypeHelpGiven'), 'help_given'],
      [t('timelineTypeHelpReceived'), 'help_received'],
      [t('timelineTypeNote'), 'note'],
    ])
    return labelMap.get(trimmed) ?? null
  }

  const openInteractionModal = (preset?: Partial<typeof interactionForm>) => {
    const presetType = preset?.type ? normalizeInteractionType(preset.type) : null
    setInteractionForm({
      type: presetType ?? 'meeting',
      occurredAt: preset?.occurredAt ?? toLocalInputValue(new Date()),
      summary: preset?.summary ?? '',
      nextAction: preset?.nextAction ?? '',
    })
    setInteractionErrors({})
    setInteractionModalOpen(true)
  }

  const openReminderModal = () => {
    const defaultTitle = contact ? `${t('remindersDefaultTitlePrefix')} ${contact.display_name}` : ''
    setReminderForm({
      title: defaultTitle,
      dueAt: toLocalInputValue(new Date()),
      body: '',
    })
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
    setIntroductionModalOpen(true)
  }

  const saveInteraction = async () => {
    if (!contactId) return
    const errors: { type?: string; occurredAt?: string } = {}
    const normalizedType = normalizeInteractionType(interactionForm.type || '')
    if (!normalizedType) {
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
    if (!normalizedType) return

    setInteractionSubmitting(true)
    try {
      await createInteraction(contactId, {
        type: normalizedType,
        occurred_at: occurredAtDate.toISOString(),
        summary: interactionForm.summary.trim() || undefined,
        next_action: interactionForm.nextAction.trim() || undefined,
      })
      const next = new URLSearchParams(searchParams)
      next.set('tab', 'timeline')
      setSearchParams(next)
      setInteractionModalOpen(false)
      toast.success(t('toastSaved'))
      const items = await loadInteractions(contactId)
      setTimeline(items)
      setFollowUpBaseDate(occurredAtDate)
      setFollowUpPromptOpen(true)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('toastActionFailed')}: ${detail}` : t('toastActionFailed')
      toast.error(message)
    } finally {
      setInteractionSubmitting(false)
    }
  }

  const createFollowUpReminder = async (days: number) => {
    if (!contactId || !contact || followUpSubmitting) return
    const base = followUpBaseDate || new Date()
    const dueAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    setFollowUpSubmitting(true)
    try {
      await createReminder(contactId, {
        title: `${t('followUpTitlePrefix')} ${contact.display_name}`,
        due_at: dueAt.toISOString(),
      })
      toast.success(t('toastSaved'))
      onReminderCreated()
      const reminders = await loadRemindersForContact(contactId)
      setContactReminders(reminders || [])
      const sortedReminders = [...(reminders || [])]
        .filter((item) => item.due_at)
        .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
      setNextReminder(sortedReminders[0] || null)
      setFollowUpPromptOpen(false)
    } catch {
      toast.error(t('toastActionFailed'))
    } finally {
      setFollowUpSubmitting(false)
    }
  }

  const saveReminder = async () => {
    if (!contactId) return
    const dueDate = new Date(reminderForm.dueAt)
    if (!reminderForm.dueAt || Number.isNaN(dueDate.getTime())) {
      toast.error(t('toastActionFailed'))
      return
    }
    setReminderSubmitting(true)
    try {
      await createReminder(contactId, {
        title: reminderForm.title.trim() || undefined,
        body: reminderForm.body.trim() || undefined,
        due_at: dueDate.toISOString(),
      })
      setReminderModalOpen(false)
      toast.success(t('toastSaved'))
      onReminderCreated()
    } catch {
      toast.error(t('toastActionFailed'))
    } finally {
      setReminderSubmitting(false)
    }
  }

  const saveIntroduction = async () => {
    if (!contact) return
    if (!introductionForm.targetContactId) {
      toast.error(t('toastActionFailed'))
      return
    }
    if (!introductionForm.ask.trim()) {
      toast.error(t('toastActionFailed'))
      return
    }
    setIntroductionSubmitting(true)
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
      toast.success(t('toastSaved'))
    } catch {
      toast.error(t('toastActionFailed'))
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
    company: data.organization?.name || data.company || data.company_name || '',
    industries: (data.industries || []).join(', '),
    competencies: (data.competencies || []).join(', '),
    metContext: data.met_context || '',
    sharedNotes: data.shared_notes || '',
    privateNotes: data.private_notes || '',
    visibility: data.visibility || 'shared',
    tier: parseTierFromTags(data.tags) || '',
  })

  const privacyLabel =
    privacy === 'private'
      ? t('contactPrivacyPrivate')
      : privacy === 'shared'
        ? t('contactPrivacyShared')
        : privacy === 'limited'
          ? t('contactPrivacyLimited')
          : t('contactNotSet')

  const cadenceConfig = loadCadenceConfig()
  const tierValue = contact ? parseTierFromTags(contact.tags) : null
  const cadenceDays = tierValue ? cadenceConfig[tierValue] : null
  const tierLabel =
    tierValue === 'A'
      ? t('contactTierA')
      : tierValue === 'B'
        ? t('contactTierB')
        : tierValue === 'C'
          ? t('contactTierC')
          : t('contactTierNone')

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

  const overdueReminder = useMemo(() => {
    const now = Date.now()
    return contactReminders.find((item) => item.status === 'open' && new Date(item.due_at).getTime() < now) || null
  }, [contactReminders])

  const introRequiresStep = useMemo(() => {
    const requiredStatuses = new Set(['requested', 'approved_a', 'approved_b', 'sent', 'met'])
    return contactIntroductions.find((item) => requiredStatuses.has(item.status)) || null
  }, [contactIntroductions])

  const shouldTouch = useMemo(() => {
    if (!cadenceDays) return false
    if (!lastInteraction?.occurred_at) return true
    const last = new Date(lastInteraction.occurred_at).getTime()
    const nextDue = last + cadenceDays * 24 * 60 * 60 * 1000
    return Date.now() > nextDue
  }, [cadenceDays, lastInteraction])

  const nextAction = useMemo(() => {
    if (overdueReminder) {
      return {
        text: t('contactNextActionOverdueReminder'),
        button: t('contactNextActionOverdueReminderButton'),
        action: 'reminders',
      }
    }
    if (introRequiresStep) {
      return {
        text: t('contactNextActionIntro'),
        button: t('contactNextActionIntroButton'),
        action: 'introductions',
      }
    }
    if (shouldTouch) {
      return {
        text: t('contactNextActionTouch'),
        button: t('contactNextActionTouchButton'),
        action: 'touch',
      }
    }
    return {
      text: nextReminder
        ? `${t('contactHeaderActionContactBy')} ${new Date(nextReminder.due_at).toLocaleString()}`
        : t('contactHeaderActionAddInteraction'),
      button: t('contactNextActionDefaultButton'),
      action: 'none',
    }
  }, [introRequiresStep, nextReminder, overdueReminder, shouldTouch])

  const handleAssistantMessageSubmit = async (payload: { task: string; reason?: string; due_at?: string }) => {
    if (!contact || assistantSubmitting) return
    setAssistantSubmitting(true)
    try {
      await createAssistantMessage({
        target_type: 'contact',
        target_id: contact.id,
        task: payload.task,
        reason: payload.reason,
        due_at: payload.due_at,
      })
      toast.success(t('assistantMessageSent'))
      setAssistantModalOpen(false)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('assistantMessageFailed')}: ${detail}` : t('assistantMessageFailed')
      toast.error(message)
    } finally {
      setAssistantSubmitting(false)
    }
  }

  const handleExportPdf = async () => {
    if (!exportRef.current || !contact || exportingPdf) return
    setExportingPdf(true)
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
      const imgProps = pdf.getImageProperties(imgData)
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
      const pageHeight = pdf.internal.pageSize.getHeight()

      let heightLeft = pdfHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST')
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST')
        heightLeft -= pageHeight
      }

      pdf.save(`contact-${contact.id}.pdf`)
      toast.success(t('contactExportPdfSuccess'))
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('contactExportPdfFailed')}: ${detail}` : t('contactExportPdfFailed')
      toast.error(message)
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <section style={{ marginTop: 16 }}>
      <Link to="/contacts" style={{ textDecoration: 'none', color: '#1f5eff' }}>
        {t('contactBackToList')}
      </Link>

      <div ref={exportRef}>
        <div style={{ marginTop: 12 }} data-testid="contact-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ marginBottom: 6 }}>{t('contactCardTitle')}</h2>
            {contact &&
              (isEditing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsEditing(false)
                    }}
                    dataTestId="contact-edit-cancel"
                  >
                    {t('contactEditCancel')}
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!contact) return
                      if (!editForm.displayName.trim()) {
                        toast.error(t('toastActionFailed'))
                        return
                      }
                      setEditSubmitting(true)
                      try {
                        const normalizedTier =
                          editForm.tier === 'A' || editForm.tier === 'B' || editForm.tier === 'C'
                            ? (editForm.tier as CadenceTier)
                            : null
                        const nextTags = applyTierToTags(contact.tags, normalizedTier)
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
                          tags: nextTags,
                        }
                        const trimmedCompany = editForm.company.trim()
                        if (trimmedCompany) {
                          payload.organization_id = await resolveOrganizationId(trimmedCompany)
                        } else {
                          payload.organization_id = null
                        }
                        if (!isLimitedForAssistant) {
                          payload.shared_notes = editForm.sharedNotes.trim() || null
                          payload.private_notes = editForm.privateNotes.trim() || null
                        }
                        const updated = await updateContact(contact.id, payload)
                        if (updated) {
                          setContact(updated)
                          toast.success(t('toastSaved'))
                          setIsEditing(false)
                        }
                      } catch (err) {
                        const detail = err instanceof Error ? err.message : String(err)
                        const message = import.meta.env.DEV && detail ? `${t('toastActionFailed')}: ${detail}` : t('toastActionFailed')
                        toast.error(message)
                      } finally {
                        setEditSubmitting(false)
                      }
                    }}
                    loading={editSubmitting}
                    loadingLabel={t('contactsSavingLabel')}
                    dataTestId="contact-edit-save"
                  >
                    {t('contactEditSave')}
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  {role === 'assistant' && (
                    <Button variant="secondary" onClick={() => setAssistantModalOpen(true)}>
                      {t('assistantMessageButton')}
                    </Button>
                  )}
                  <Button variant="secondary" onClick={handleExportPdf} loading={exportingPdf} loadingLabel={t('contactExportPdfLoading')}>
                    {t('contactExportPdfButton')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!contact) return
                      setEditForm(buildEditForm(contact))
                      setIsEditing(true)
                    }}
                    dataTestId="contact-edit"
                  >
                    {t('contactEditButton')}
                  </Button>
                </div>
              ))}
          </div>
          {loading && <Alert type="info">{t('contactsLoading')}</Alert>}
          {error && <Alert type="error">{t('contactsLoadFailed')}</Alert>}
          {!loading && !contact && !error && <Alert type="info">{t('timelineContactMissing')}</Alert>}
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
            <div
              style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}
              data-testid="next-action-card"
              data-action={nextAction.action}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('contactHeaderNextAction')}</div>
              <div style={{ fontSize: 14 }} data-testid="next-action-text">
                {nextAction.text}
              </div>
              <div style={{ marginTop: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!contactId) return
                    if (nextAction.action === 'reminders') {
                      navigate('/today')
                      return
                    }
                    if (nextAction.action === 'introductions') {
                      navigate('/introductions')
                      return
                    }
                    if (nextAction.action === 'touch') {
                      const params = new URLSearchParams({
                        action: 'interaction',
                        interaction_type: 'message',
                        interaction_summary: t('contactNextActionTouchSummary'),
                        tab: 'timeline',
                      })
                      navigate(`/contacts/${contactId}?${params.toString()}`)
                    }
                  }}
                  dataTestId="contact-next-action"
                >
                  {nextAction.button}
                </Button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  data-testid={`tab-${tab.key}`}
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
                <Alert type="info" dataTestId="contact-limited-notice">
                  {t('contactLimitedNotice')}
                </Alert>
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
                      dataTestId="contact-edit-name"
                    />
                  ) : (
                <div style={{ fontSize: 22, fontWeight: 600 }} data-testid="contact-name">
                  {contact.display_name}
                </div>
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
                    <Button variant="secondary" onClick={openInteractionModal} dataTestId="add-interaction">
                      {t('contactActionAddInteraction')}
                    </Button>
                    <Button variant="secondary" onClick={openReminderModal} dataTestId="add-reminder">
                      {t('contactActionSetReminder')}
                    </Button>
                    <Button variant="secondary" onClick={openIntroductionModal} dataTestId="add-introduction">
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
                      {isEditing ? (
                        <TextField
                          label={t('contactCompanyLabel')}
                          value={editForm.company}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, company: value }))}
                        />
                      ) : (
                        <>
                          {t('contactCompanyLabel')}: {company || t('contactNotSet')}
                        </>
                      )}
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
                          label={t('contactTierLabel')}
                          value={editForm.tier}
                          onChange={(value) => setEditForm((prev) => ({ ...prev, tier: value }))}
                          options={[
                            { value: '', label: t('contactTierNone') },
                            { value: 'A', label: t('contactTierA') },
                            { value: 'B', label: t('contactTierB') },
                            { value: 'C', label: t('contactTierC') },
                          ]}
                        />
                      ) : (
                        <>
                          {t('contactTierLabel')}: {tierLabel}
                        </>
                      )}
                      {!isEditing && (
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                          {cadenceDays
                            ? `${t('contactTierHelpPrefix')} ${cadenceDays} ${t('contactTierHelpSuffix')}`
                            : t('contactTierHelpEmpty')}
                        </div>
                      )}
                    </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ fontWeight: 600 }}>{t('contactTabTimeline')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button variant="secondary" onClick={handleExportTimelineCsv}>
                    {t('timelineExportCsv')}
                  </Button>
                  <Button variant="secondary" onClick={handleExportTimelineJson}>
                    {t('timelineExportJson')}
                  </Button>
                  <Button onClick={openInteractionModal} dataTestId="add-interaction">
                    {t('contactActionAddInteraction')}
                  </Button>
                </div>
              </div>
              <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 600 }}>{t('timelineFiltersTitle')}</div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div style={{ display: 'grid', gap: 6 }} data-testid="timeline-filter-types">
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
                            data-testid={`timeline-filter-${option.value}`}
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
                    dataTestId="timeline-filter-period"
                  />
                </div>
                <div style={{ fontSize: 13, color: '#666' }}>
                  {t('timelineShown')}: {filteredTimeline.length}
                </div>
              </div>
            {followUpPromptOpen && contact && (
              <div
                style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, display: 'grid', gap: 10 }}
                data-testid="follow-up-prompt"
              >
                <div style={{ fontWeight: 600 }}>{t('followUpPromptTitle')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => createFollowUpReminder(3)}
                    loading={followUpSubmitting}
                    disabled={followUpSubmitting}
                    dataTestId="follow-up-3"
                  >
                    {t('followUpIn3')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => createFollowUpReminder(7)}
                    loading={followUpSubmitting}
                    disabled={followUpSubmitting}
                    dataTestId="follow-up-7"
                  >
                    {t('followUpIn7')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => createFollowUpReminder(14)}
                    loading={followUpSubmitting}
                    disabled={followUpSubmitting}
                    dataTestId="follow-up-14"
                  >
                    {t('followUpIn14')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setFollowUpPromptOpen(false)}
                    disabled={followUpSubmitting}
                    dataTestId="follow-up-skip"
                  >
                    {t('followUpSkip')}
                  </Button>
                </div>
              </div>
            )}
              {timelineLoading && <Alert type="info">{t('contactsLoading')}</Alert>}
              {timelineError && (
                <Alert type="error">
                  {timelineError}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!contactId) return
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
              {!timelineLoading && !timelineError && (
                <div style={{ display: 'grid', gap: 8 }} data-testid="timeline-list">
                  {filteredTimeline.length === 0 ? (
                    <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('timelineEmpty')}</div>
                  ) : (
                    [...filteredTimeline]
                      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
                      .map((item) => (
                        <div
                          key={item.id}
                          data-testid={`timeline-item-${item.id}`}
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
                      ))
                  )}
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
            data-testid="timeline-add-modal"
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
                dataTestId="interaction-type"
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
                dataTestId="interaction-datetime"
              />
              <TextField
                label={t('timelineFieldSummary')}
                value={interactionForm.summary}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, summary: value }))}
                dataTestId="interaction-notes"
              />
              <TextField
                label={t('timelineFieldNextAction')}
                value={interactionForm.nextAction}
                onChange={(value) => setInteractionForm((prev) => ({ ...prev, nextAction: value }))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setInteractionModalOpen(false)}>
                  {t('timelineCancel')}
                </Button>
                <Button
                  onClick={saveInteraction}
                  loading={interactionSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                  dataTestId="interaction-save"
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
            data-testid="reminder-create"
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
                dataTestId="reminder-due"
              />
              <TextField
                label={t('remindersCommentLabel')}
                value={reminderForm.body}
                onChange={(value) => setReminderForm((prev) => ({ ...prev, body: value }))}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setReminderModalOpen(false)}>
                  {t('remindersCancel')}
                </Button>
                <Button
                  onClick={saveReminder}
                  loading={reminderSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                  dataTestId="reminder-save"
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
            data-testid="introduction-create"
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
                dataTestId="intro-target"
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
                      data-testid={`intro-target-${item.id}`}
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
                dataTestId="intro-goal"
              />
              <TextField
                label={t('introductionsCriteriaLabel')}
                value={introductionForm.criteria}
                onChange={(value) => setIntroductionForm((prev) => ({ ...prev, criteria: value }))}
                dataTestId="intro-criteria"
              />
              <TextField
                label={t('introductionsMessageLabel')}
                value={introductionForm.message}
                onChange={(value) => setIntroductionForm((prev) => ({ ...prev, message: value }))}
                dataTestId="intro-message"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setIntroductionModalOpen(false)}>
                  {t('introductionsCancel')}
                </Button>
                <Button
                  onClick={saveIntroduction}
                  loading={introductionSubmitting}
                  loadingLabel={t('contactsSavingLabel')}
                  dataTestId="intro-save"
                >
                  {t('introductionsSave')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      <AssistantMessageModal
        open={assistantModalOpen}
        targetLabel={contact ? `${t('assistantMessageTargetContact')}: ${contact.display_name}` : null}
        submitting={assistantSubmitting}
        onClose={() => setAssistantModalOpen(false)}
        onSubmit={handleAssistantMessageSubmit}
      />
    </section>
  )
}
