import React, { useEffect, useMemo, useState } from 'react'
import AssistantMessageModal from '../components/AssistantMessageModal'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import { t } from '../i18n/t'
import { useToast } from '../components/ui/Toast'
import type { ApiRequestOptions, AssistantMessageCreate, Contact, Introduction } from '../types'

type IntroductionsPageProps = {
  contacts: Contact[]
  apiRequest: <T,>(path: string, options?: ApiRequestOptions) => Promise<T>
  role: 'owner' | 'assistant'
  createAssistantMessage: (payload: AssistantMessageCreate) => Promise<void>
}

type FilterKey = 'all' | 'draft' | 'approval' | 'sent' | 'met' | 'completed'

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

const allowedTransitions: Record<string, string[]> = {
  requested: ['approved_a', 'approved_b', 'canceled'],
  approved_a: ['approved_b', 'sent', 'canceled'],
  approved_b: ['approved_a', 'sent', 'canceled'],
  sent: ['met', 'completed', 'canceled'],
  met: ['completed', 'canceled'],
  completed: [],
  canceled: [],
}

const statusHint = (nextStatus: string) => {
  if (nextStatus === 'sent') return t('introHintSent')
  if (nextStatus === 'met') return t('introHintMet')
  if (nextStatus === 'completed') return t('introHintCompleted')
  if (nextStatus === 'approved_a') return t('introHintApprovedA')
  if (nextStatus === 'approved_b') return t('introHintApprovedB')
  if (nextStatus === 'canceled') return t('introHintCanceled')
  return ''
}

export default function IntroductionsPage({ contacts, apiRequest, role, createAssistantMessage }: IntroductionsPageProps) {
  const [items, setItems] = useState<Introduction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<Introduction | null>(null)
  const [consents, setConsents] = useState({ requester: false, target: false })
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const [assistantModalOpen, setAssistantModalOpen] = useState(false)
  const [assistantSubmitting, setAssistantSubmitting] = useState(false)
  const [selectedIntroForMessage, setSelectedIntroForMessage] = useState<Introduction | null>(null)

  const contactById = useMemo(
    () => Object.fromEntries(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiRequest<{ data: Introduction[] }>('/api/v1/introductions', { params: { limit: 200 } })
      .then((res) => {
        if (!cancelled) setItems(res.data || [])
      })
      .catch((err) => {
        if (cancelled) return
        const detail = err instanceof Error ? err.message : String(err)
        setError(detail || t('introLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiRequest])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'draft') return items.filter((item) => item.status === 'requested')
    if (filter === 'approval') return items.filter((item) => item.status === 'approved_a' || item.status === 'approved_b')
    if (filter === 'sent') return items.filter((item) => item.status === 'sent')
    if (filter === 'met') return items.filter((item) => item.status === 'met')
    if (filter === 'completed') return items.filter((item) => item.status === 'completed')
    return items
  }, [filter, items])

  const openDetails = (intro: Introduction) => {
    setSelected(intro)
    setConsents({
      requester: Boolean(intro.consent_requester),
      target: Boolean(intro.consent_target),
    })
  }

  const updateIntroduction = async (introId: string, payload: Record<string, unknown>) => {
    setSaving(true)
    try {
      const updated = await apiRequest<Introduction>(`/api/v1/introductions/${introId}`, {
        method: 'PATCH',
        body: payload,
      })
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setSelected(updated)
      toast.success(t('toastSaved'))
    } catch (err) {
      toast.error(t('toastActionFailed'))
    } finally {
      setSaving(false)
    }
  }

  const renderParticipant = (contactId: string) => {
    const contact = contactById[contactId]
    if (!contact) return contactId
    return contact.display_name
  }

  const renderCompany = (contactId: string) => {
    const contact = contactById[contactId]
    if (!contact) return null
    return contact.organization?.name || contact.company_name || contact.company || null
  }

  const buildIntroText = (intro: Introduction) => {
    const requesterName = renderParticipant(intro.requester_contact_id)
    const targetName = renderParticipant(intro.target_contact_id)
    const requesterCompany = renderCompany(intro.requester_contact_id)
    const targetCompany = renderCompany(intro.target_contact_id)

    const requesterLine = requesterCompany ? `${requesterName} (${requesterCompany})` : requesterName
    const targetLine = targetCompany ? `${targetName} (${targetCompany})` : targetName

    const lines = [`${t('introTemplateGreeting')} ${requesterLine} ${t('introTemplateAnd')} ${targetLine}.`]
    if (intro.ask) {
      lines.push(`${t('introTemplateGoal')}: ${intro.ask}.`)
    }
    if (intro.benefit_for_requester) {
      lines.push(`${t('introTemplateRequesterValue')}: ${intro.benefit_for_requester}.`)
    }
    if (intro.benefit_for_target) {
      lines.push(`${t('introTemplateTargetValue')}: ${intro.benefit_for_target}.`)
    }
    lines.push(t('introTemplateClosing'))
    return lines.join('\n')
  }

  const handleAssistantMessageSubmit = async (payload: { task: string; reason?: string; due_at?: string }) => {
    if (!selectedIntroForMessage || assistantSubmitting) return
    setAssistantSubmitting(true)
    try {
      await createAssistantMessage({
        target_type: 'introduction',
        target_id: selectedIntroForMessage.id,
        task: payload.task,
        reason: payload.reason,
        due_at: payload.due_at,
      })
      toast.success(t('assistantMessageSent'))
      setAssistantModalOpen(false)
      setSelectedIntroForMessage(null)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const message = import.meta.env.DEV && detail ? `${t('assistantMessageFailed')}: ${detail}` : t('assistantMessageFailed')
      toast.error(message)
    } finally {
      setAssistantSubmitting(false)
    }
  }

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2>{t('menuIntroductions')}</h2>
        <div style={{ width: 260 }}>
          <Select
            label={t('introFilterLabel')}
            value={filter}
            onChange={(value) => setFilter(value as FilterKey)}
            options={[
              { value: 'all', label: t('introFilterAll') },
              { value: 'draft', label: t('introFilterDraft') },
              { value: 'approval', label: t('introFilterApproval') },
              { value: 'sent', label: t('introFilterSent') },
              { value: 'met', label: t('introFilterMet') },
              { value: 'completed', label: t('introFilterCompleted') },
            ]}
          />
        </div>
      </div>
      {loading && <Alert type="info">{t('introLoading')}</Alert>}
      {error && <Alert type="error">{error}</Alert>}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('introEmpty')}</div>
      )}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }} data-testid="introductions-list">
          {filtered.map((intro) => (
            <div
              key={intro.id}
              data-testid={`introduction-row-${intro.id}`}
              style={{ padding: 12, borderRadius: 10, border: '1px solid #e5e7eb', display: 'grid', gap: 6 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontWeight: 600 }} data-testid="intro-status">
                  {t('introStatusLabel')}: {statusLabel(intro.status)}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>{new Date(intro.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ fontSize: 13, color: '#444' }}>
                {t('introParticipantsLabel')}: {renderParticipant(intro.requester_contact_id)},{' '}
                {renderParticipant(intro.introducer_contact_id)}, {renderParticipant(intro.target_contact_id)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => openDetails(intro)} dataTestId={`intro-open-${intro.id}`}>
                  {t('introOpen')}
                </Button>
                {role === 'assistant' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedIntroForMessage(intro)
                      setAssistantModalOpen(true)
                    }}
                  >
                    {t('assistantMessageButton')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
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
              maxWidth: 680,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h3 style={{ marginTop: 0 }}>{t('introDetailsTitle')}</h3>
              <Button variant="secondary" onClick={() => setSelected(null)}>
                {t('introClose')}
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, color: '#666' }}>{t('introParticipantsLabel')}</div>
                <div style={{ fontSize: 14 }}>
                  {renderParticipant(selected.requester_contact_id)} → {renderParticipant(selected.introducer_contact_id)} →{' '}
                  {renderParticipant(selected.target_contact_id)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#666' }}>{t('introGoalLabel')}</div>
                <div style={{ fontSize: 14 }}>{selected.ask || t('introEmptyValue')}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#666' }}>{t('introCriteriaLabel')}</div>
                <div style={{ fontSize: 14 }}>{selected.benefit_for_requester || t('introEmptyValue')}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#666' }}>{t('introConsentsLabel')}</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={consents.requester}
                      onChange={(event) => setConsents((prev) => ({ ...prev, requester: event.target.checked }))}
                    />
                    <span>
                      {t('introConsentLabel')} {renderParticipant(selected.requester_contact_id)}
                    </span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={consents.target}
                      onChange={(event) => setConsents((prev) => ({ ...prev, target: event.target.checked }))}
                    />
                    <span>
                      {t('introConsentLabel')} {renderParticipant(selected.target_contact_id)}
                    </span>
                  </label>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      updateIntroduction(selected.id, {
                        consent_requester: consents.requester,
                        consent_target: consents.target,
                      })
                    }
                    loading={saving}
                    loadingLabel={t('introSaving')}
                  >
                    {t('introSaveConsents')}
                  </Button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{t('introHistoryLabel')}</div>
                <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                  <div>
                    {t('introHistoryCreated')}: {new Date(selected.created_at).toLocaleString()}
                  </div>
                  {selected.sent_at && (
                    <div>
                      {t('introHistorySent')}: {new Date(selected.sent_at).toLocaleString()}
                    </div>
                  )}
                  {selected.met_at && (
                    <div>
                      {t('introHistoryMet')}: {new Date(selected.met_at).toLocaleString()}
                    </div>
                  )}
                  {selected.status === 'completed' && (
                    <div>
                      {t('introHistoryCompleted')}: {new Date(selected.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{t('introStatusActionsLabel')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(allowedTransitions[selected.status] || []).map((nextStatus) => (
                    <Button
                      key={nextStatus}
                      variant="secondary"
                      onClick={() => updateIntroduction(selected.id, { status: nextStatus })}
                      loading={saving}
                      loadingLabel={t('introSaving')}
                    >
                      <span title={statusHint(nextStatus)}>{statusLabel(nextStatus)}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>{t('introTemplateTitle')}</div>
                <textarea
                  readOnly
                  value={buildIntroText(selected)}
                  style={{
                    width: '100%',
                    minHeight: 160,
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    background: '#fafafa',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const text = buildIntroText(selected)
                      try {
                        await navigator.clipboard.writeText(text)
                        toast.success(t('toastCopied'))
                      } catch {
                        toast.error(t('toastActionFailed'))
                      }
                    }}
                    dataTestId="intro-copy-text"
                  >
                    {t('introCopyButton')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <AssistantMessageModal
        open={assistantModalOpen}
        targetLabel={
          selectedIntroForMessage
            ? `${t('assistantMessageTargetIntroduction')}: ${renderParticipant(selectedIntroForMessage.requester_contact_id)} → ${renderParticipant(
                selectedIntroForMessage.target_contact_id,
              )}`
            : null
        }
        submitting={assistantSubmitting}
        onClose={() => {
          setAssistantModalOpen(false)
          setSelectedIntroForMessage(null)
        }}
        onSubmit={handleAssistantMessageSubmit}
      />
    </section>
  )
}
