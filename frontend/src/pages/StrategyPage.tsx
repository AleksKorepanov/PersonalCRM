import React, { useMemo, useState } from 'react'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import { DEFAULT_CADENCE, loadCadenceConfig, saveCadenceConfig } from '../utils/cadence'

export default function StrategyPage() {
  const initial = useMemo(() => loadCadenceConfig(), [])
  const [cadence, setCadence] = useState({
    A: String(initial.A),
    B: String(initial.B),
    C: String(initial.C),
  })
  const [success, setSuccess] = useState<string | null>(null)

  const normalizeValue = (value: string, fallback: number) => {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return parsed
  }

  const handleSave = () => {
    const config = {
      A: normalizeValue(cadence.A, DEFAULT_CADENCE.A),
      B: normalizeValue(cadence.B, DEFAULT_CADENCE.B),
      C: normalizeValue(cadence.C, DEFAULT_CADENCE.C),
    }
    saveCadenceConfig(config)
    setCadence({ A: String(config.A), B: String(config.B), C: String(config.C) })
    setSuccess(t('cadenceSaved'))
  }

  const handleReset = () => {
    saveCadenceConfig(DEFAULT_CADENCE)
    setCadence({
      A: String(DEFAULT_CADENCE.A),
      B: String(DEFAULT_CADENCE.B),
      C: String(DEFAULT_CADENCE.C),
    })
    setSuccess(t('cadenceReset'))
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2>{t('cadenceSettingsTitle')}</h2>
      <div style={{ color: '#666', marginBottom: 12 }}>{t('cadenceSettingsDescription')}</div>
      {success && <Alert type="success">{success}</Alert>}
      <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <TextField
          label={t('cadenceTierALabel')}
          value={cadence.A}
          onChange={(value) => setCadence((prev) => ({ ...prev, A: value }))}
          type="number"
        />
        <TextField
          label={t('cadenceTierBLabel')}
          value={cadence.B}
          onChange={(value) => setCadence((prev) => ({ ...prev, B: value }))}
          type="number"
        />
        <TextField
          label={t('cadenceTierCLabel')}
          value={cadence.C}
          onChange={(value) => setCadence((prev) => ({ ...prev, C: value }))}
          type="number"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleSave}>{t('cadenceSave')}</Button>
          <Button variant="secondary" onClick={handleReset}>
            {t('cadenceResetButton')}
          </Button>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>{t('cadenceDaysLabel')}</div>
    </section>
  )
}
