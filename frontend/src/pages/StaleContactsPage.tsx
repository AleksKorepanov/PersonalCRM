import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import { t } from '../i18n/t'
import type { Contact, Interaction } from '../types'
import { loadCadenceConfig, parseTierFromTags, type CadenceTier } from '../utils/cadence'

type StaleContactsPageProps = {
  contacts: Contact[]
  contactsLoading: boolean
  contactError: string | null
  role: 'owner' | 'assistant'
  loadInteractions: (contactId: string) => Promise<Interaction[]>
  onRefreshContacts: () => void
}

type TouchInfo = {
  lastTouch: string | null
}

const dayMs = 24 * 60 * 60 * 1000

export default function StaleContactsPage({
  contacts,
  contactsLoading,
  contactError,
  role,
  loadInteractions,
  onRefreshContacts,
}: StaleContactsPageProps) {
  const navigate = useNavigate()
  const [touchInfo, setTouchInfo] = useState<Record<string, TouchInfo>>({})
  const [touchLoading, setTouchLoading] = useState(false)
  const [touchError, setTouchError] = useState<string | null>(null)

  const visibleContacts = role === 'assistant' ? contacts.filter((contact) => contact.visibility !== 'private') : contacts

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

  const cadenceConfig = useMemo(() => loadCadenceConfig(), [])

  const rows = useMemo(() => {
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
        const score = overdueDays !== null ? overdueDays : -999999
        return {
          contact,
          tier,
          cadenceDays,
          lastTouchDate,
          nextDueDate,
          overdueDays,
          isOverdue,
          score,
        }
      })
      .sort((a, b) => b.score - a.score)
  }, [cadenceConfig, touchInfo, visibleContacts])

  const tierLabel = (tier: CadenceTier | null) => {
    if (tier === 'A') return t('contactTierA')
    if (tier === 'B') return t('contactTierB')
    if (tier === 'C') return t('contactTierC')
    return t('contactTierNone')
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2>{t('staleContactsTitle')}</h2>
      <div style={{ color: '#666', marginBottom: 12 }}>{t('staleContactsDescription')}</div>
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
      {touchLoading && <Alert type="info">{t('staleContactsLoading')}</Alert>}
      {touchError && <Alert type="error">{touchError}</Alert>}
      {!contactsLoading && visibleContacts.length === 0 && (
        <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('staleContactsEmpty')}</div>
      )}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((row) => {
            const email = row.contact.emails?.[0]
            const lastTouchLabel = row.lastTouchDate ? row.lastTouchDate.toLocaleDateString() : t('staleNoTouches')
            const nextDueLabel = row.nextDueDate ? row.nextDueDate.toLocaleDateString() : t('staleNoNextDue')
            const statusLabel = row.isOverdue ? t('staleStatusOverdue') : row.nextDueDate ? t('staleStatusOk') : t('staleStatusUnknown')
            const overdueLabel = row.isOverdue && row.overdueDays !== null ? `${t('staleOverduePrefix')} ${row.overdueDays} ${t('staleOverdueSuffix')}` : ''
            return (
              <div
                key={row.contact.id}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.contact.display_name}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>
                      {t('contactTierLabel')}: {tierLabel(row.tier)} • {t('staleCadenceLabel')}:{' '}
                      {row.cadenceDays ? `${row.cadenceDays} ${t('staleCadenceDays')}` : t('staleCadenceMissing')}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: row.isOverdue ? '#b00020' : '#2d6a4f' }}>
                    {statusLabel}
                    {overdueLabel ? ` • ${overdueLabel}` : ''}
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 4, fontSize: 13, color: '#444' }}>
                  <div>
                    {t('staleLastTouchLabel')}: {lastTouchLabel}
                  </div>
                  <div>
                    {t('staleNextDueLabel')}: {nextDueLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (email) window.location.href = `mailto:${email}`
                    }}
                    disabled={!email}
                  >
                    {t('staleActionWrite')}
                  </Button>
                  <Button variant="secondary" onClick={() => navigate(`/contacts/${row.contact.id}?action=reminder`)}>
                    {t('staleActionReminder')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/contacts/${row.contact.id}?action=interaction&tab=timeline`)}
                  >
                    {t('staleActionInteraction')}
                  </Button>
                </div>
                {!email && <div style={{ fontSize: 12, color: '#666' }}>{t('staleNoEmail')}</div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
