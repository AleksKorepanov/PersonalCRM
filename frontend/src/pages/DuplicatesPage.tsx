import React, { useEffect, useMemo, useState } from 'react'
import type { Contact, DuplicateGroup } from '../types'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import { t } from '../i18n/t'
import { useToast } from '../components/ui/Toast'

type DuplicatesPageProps = {
  loadDuplicates: () => Promise<DuplicateGroup[]>
  mergeContacts: (primaryId: string, mergeIds: string[]) => Promise<void>
}

const fields: Array<{ key: keyof Contact | 'company' | 'tags'; label: string }> = [
  { key: 'display_name', label: t('duplicatesFieldName') },
  { key: 'emails', label: t('duplicatesFieldEmail') },
  { key: 'phones', label: t('duplicatesFieldPhone') },
  { key: 'company', label: t('duplicatesFieldCompany') },
  { key: 'tags', label: t('duplicatesFieldTags') },
]

const formatList = (values?: string[]) => {
  if (!values || values.length === 0) return t('emptyValue')
  return values.join(', ')
}

const getCompany = (contact: Contact) =>
  contact.organization?.name || contact.company_name || contact.company || t('emptyValue')

export default function DuplicatesPage({ loadDuplicates, mergeContacts }: DuplicatesPageProps) {
  const toast = useToast()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadDuplicates()
      setGroups(data)
    } catch (err) {
      setError((err as Error).message || t('duplicatesLoadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const reasonLabel = (reason: DuplicateGroup['reason']) => {
    if (reason === 'email') return t('duplicatesReasonEmail')
    if (reason === 'phone') return t('duplicatesReasonPhone')
    return t('duplicatesReasonName')
  }

  const comparisonRows = useMemo(() => {
    if (!selectedGroup) return []
    return fields.map((field) => {
      const primary = selectedGroup.primary_contact
      const candidates = selectedGroup.candidates
      const primaryValue =
        field.key === 'company'
          ? getCompany(primary)
          : field.key === 'tags'
            ? formatList(primary.tags)
            : field.key === 'emails'
              ? formatList(primary.emails)
              : field.key === 'phones'
                ? formatList(primary.phones)
                : (primary[field.key as keyof Contact] as string | undefined) || t('emptyValue')
      const candidateValues = candidates.map((candidate) => {
        if (field.key === 'company') return getCompany(candidate)
        if (field.key === 'tags') return formatList(candidate.tags)
        if (field.key === 'emails') return formatList(candidate.emails)
        if (field.key === 'phones') return formatList(candidate.phones)
        return (candidate[field.key as keyof Contact] as string | undefined) || t('emptyValue')
      })
      return { label: field.label, primary: primaryValue, candidates: candidateValues }
    })
  }, [selectedGroup])

  const handleMerge = async () => {
    if (!selectedGroup || submitting) return
    const confirmed = window.confirm(t('duplicatesMergeConfirm'))
    if (!confirmed) return
    setSubmitting(true)
    try {
      await mergeContacts(
        selectedGroup.primary_contact.id,
        selectedGroup.candidates.map((c) => c.id),
      )
      toast.success(t('duplicatesMergedSuccess'))
      setSelectedGroup(null)
      await load()
    } catch (err) {
      setError((err as Error).message || t('duplicatesMergeFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section style={{ marginTop: 'var(--space-3)' }}>
      <SectionHeader
        title={t('duplicatesTitle')}
        actions={
          <Button variant="secondary" onClick={load} disabled={loading} dataTestId="duplicates-refresh">
            {t('duplicatesRefresh')}
          </Button>
        }
      />

      {loading && <Alert type="info">{t('duplicatesLoading')}</Alert>}
      {error && (
        <Alert type="error">
          {t('duplicatesLoadFailed')} {error}
          {error.includes(t('duplicatesDisabledMessage')) ? (
            <div style={{ marginTop: 6 }}>{t('duplicatesDisabledHint')}</div>
          ) : null}
        </Alert>
      )}

      {!loading && !error && groups.length === 0 && (
        <div style={{ padding: 12, border: '1px dashed #ddd', borderRadius: 8 }}>{t('duplicatesEmpty')}</div>
      )}

      {!loading && groups.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }} data-testid="duplicates-list">
          {groups.map((group, idx) => (
            <div
              key={`${group.primary_contact.id}-${idx}`}
              data-testid={`duplicates-group-${idx}`}
              style={{ border: '1px solid #e6e6e6', borderRadius: 10, padding: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {t('duplicatesPrimary')}: {group.primary_contact.display_name}
                  </div>
                  <div style={{ color: '#666', fontSize: 13 }}>
                    {t('duplicatesCandidates')}: {group.candidates.map((c) => c.display_name).join(', ')}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {t('duplicatesReasonLabel')}: {reasonLabel(group.reason)}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setSelectedGroup(group)} dataTestId={`duplicates-open-${idx}`}>
                  {t('duplicatesCompare')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedGroup && (
        <div
          data-testid="duplicates-modal"
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
              maxWidth: 900,
              background: '#fff',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{t('duplicatesCompareTitle')}</h3>
              <Button variant="secondary" onClick={() => setSelectedGroup(null)}>
                {t('duplicatesClose')}
              </Button>
            </div>

            <div style={{ marginBottom: 12, fontSize: 14 }}>
              {t('duplicatesPrimary')}: {selectedGroup.primary_contact.display_name}
            </div>

            {selectedGroup.candidates.map((candidate, idx) => (
              <div key={candidate.id} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {t('duplicatesCandidateLabel')} {idx + 1}: {candidate.display_name}
                </div>
                <div style={{ border: '1px solid #e6e6e6', borderRadius: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: '#f7f7f7' }}>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e6e6e6' }}>
                          {t('duplicatesFieldLabel')}
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e6e6e6' }}>
                          {t('duplicatesPrimary')}
                        </th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e6e6e6' }}>
                          {t('duplicatesCandidate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.label}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>{row.label}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>{row.primary}</td>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>
                            {row.candidates[idx] ?? t('emptyValue')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#666' }}>{t('duplicatesMergeHint')}</div>
              <Button onClick={handleMerge} loading={submitting} disabled={submitting} dataTestId="duplicates-merge">
                {t('duplicatesMerge')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
