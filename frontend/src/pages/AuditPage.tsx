import React, { useCallback, useMemo, useState } from 'react'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import Select from '../components/ui/Select'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import type { ApiRequestOptions, AuditEvent } from '../types'

type AuditPageProps = {
  role: 'owner' | 'assistant'
  apiRequest: <T,>(path: string, options?: ApiRequestOptions) => Promise<T>
}

const entityOptions = [
  { value: '', label: t('auditEntityAll') },
  { value: 'contact', label: t('auditEntityContact') },
  { value: 'interaction', label: t('auditEntityInteraction') },
  { value: 'introduction', label: t('auditEntityIntroduction') },
  { value: 'reminder', label: t('auditEntityReminder') },
  { value: 'project', label: t('auditEntityProject') },
  { value: 'member', label: t('auditEntityMember') },
  { value: 'role', label: t('auditEntityRole') },
]

const toDateTimeRange = (value: string, isEnd: boolean) => {
  if (!value) return undefined
  return `${value}T${isEnd ? '23:59:59' : '00:00:00'}`
}

const toLabel = (value: string | null | undefined, fallback = t('emptyValue')) => value || fallback

export default function AuditPage({ role, apiRequest }: AuditPageProps) {
  if (role === 'assistant') {
    return (
      <section style={{ marginTop: 16 }}>
        <h2>{t('auditNoAccessTitle')}</h2>
        <div style={{ color: '#666' }}>{t('auditNoAccessDescription')}</div>
      </section>
    )
  }

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [entityType, setEntityType] = useState('')
  const [actorUserId, setActorUserId] = useState('')
  const [items, setItems] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadAudit = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = { limit: '100' }
      const since = toDateTimeRange(fromDate, false)
      const until = toDateTimeRange(toDate, true)
      if (since) params.since = since
      if (until) params.until = until
      if (entityType) params.entity_type = entityType
      if (actorUserId.trim()) params.actor_user_id = actorUserId.trim()
      const res = await apiRequest<{ data: AuditEvent[] }>('/api/v1/audit', { params })
      setItems(res.data || [])
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setError(detail || t('auditLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [apiRequest, actorUserId, entityType, fromDate, toDate])

  const rows = useMemo(
    () =>
      items.map((item) => {
        const roleValue = item.after && typeof item.after === 'object' ? (item.after as { actor_role?: string }).actor_role : undefined
        const roleLabel =
          roleValue === 'owner'
            ? t('roleOwner')
            : roleValue === 'assistant'
              ? t('roleAssistant')
              : t('auditRoleUnknown')

        const actionSuffix = item.action_key.split('.').pop() || item.action_key
        const actionLabel =
          actionSuffix === 'create'
            ? t('auditActionCreate')
            : actionSuffix === 'update'
              ? t('auditActionUpdate')
              : actionSuffix === 'delete'
                ? t('auditActionDelete')
                : item.action_key

        const entityLabel =
          entityOptions.find((option) => option.value === item.entity_type)?.label || item.entity_type

        return { ...item, roleLabel, actionLabel, entityLabel }
      }),
    [items],
  )

  return (
    <section style={{ marginTop: 16 }}>
      <h2>{t('menuAudit')}</h2>
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('auditFiltersTitle')}</div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <TextField
            label={t('auditFilterFrom')}
            value={fromDate}
            onChange={setFromDate}
            type="date"
          />
          <TextField label={t('auditFilterTo')} value={toDate} onChange={setToDate} type="date" />
          <Select
            label={t('auditFilterEntity')}
            value={entityType}
            onChange={setEntityType}
            options={entityOptions}
          />
          <TextField
            label={t('auditFilterUser')}
            value={actorUserId}
            onChange={setActorUserId}
            placeholder={t('auditFilterUserPlaceholder')}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button onClick={loadAudit}>{t('auditApply')}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFromDate('')
              setToDate('')
              setEntityType('')
              setActorUserId('')
              setItems([])
              setError(null)
            }}
          >
            {t('auditReset')}
          </Button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {loading && <Alert type="info">{t('auditLoading')}</Alert>}
        {error && <Alert type="error">{error}</Alert>}
        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('auditEmpty')}</div>
        )}
        {rows.length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead style={{ background: '#f9fafb', textAlign: 'left' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableDate')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableUser')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableRole')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableEntity')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableAction')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('auditTableId')}</th>
                  <th style={{ padding: '10px 12px' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const isExpanded = expandedId === item.id
                  const diffFields =
                    item.after && typeof item.after === 'object'
                      ? (item.after as { diff_fields?: string[] }).diff_fields || []
                      : []
                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ borderTop: '1px solid #eef0f2' }}>
                        <td style={{ padding: '10px 12px' }}>{new Date(item.created_at).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>{toLabel(item.actor_user_id)}</td>
                        <td style={{ padding: '10px 12px' }}>{item.roleLabel}</td>
                        <td style={{ padding: '10px 12px' }}>{item.entityLabel}</td>
                        <td style={{ padding: '10px 12px' }}>{item.actionLabel}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                          {toLabel(item.entity_id)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Button
                            variant="secondary"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          >
                            {isExpanded ? t('auditCollapse') : t('auditExpand')}
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ background: '#fbfbfd', borderTop: '1px solid #eef0f2' }}>
                          <td colSpan={7} style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('auditDetailsTitle')}</div>
                            <div style={{ display: 'grid', gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                                  {t('auditDetailsDiff')}
                                </div>
                                {diffFields.length > 0 ? (
                                  <div style={{ fontSize: 14 }}>{diffFields.join(', ')}</div>
                                ) : (
                                  <div style={{ fontSize: 14, color: '#666' }}>{t('auditNoDiff')}</div>
                                )}
                              </div>
                              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                                <div>
                                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                                    {t('auditDetailsBefore')}
                                  </div>
                                  <pre style={{ background: '#fff', padding: 10, borderRadius: 8, overflow: 'auto' }}>
                                    {item.before ? JSON.stringify(item.before, null, 2) : t('auditEmptyState')}
                                  </pre>
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                                    {t('auditDetailsAfter')}
                                  </div>
                                  <pre style={{ background: '#fff', padding: 10, borderRadius: 8, overflow: 'auto' }}>
                                    {item.after ? JSON.stringify(item.after, null, 2) : t('auditEmptyState')}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
