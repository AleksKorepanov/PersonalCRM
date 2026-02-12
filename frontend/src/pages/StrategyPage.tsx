import React, { useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import TextField from '../components/ui/TextField'
import { t } from '../i18n/t'
import { DEFAULT_CADENCE, loadCadenceConfig, saveCadenceConfig } from '../utils/cadence'
import { useToast } from '../components/ui/Toast'

export default function StrategyPage() {
  const initial = useMemo(() => loadCadenceConfig(), [])
  const [cadence, setCadence] = useState({
    A: String(initial.A),
    B: String(initial.B),
    C: String(initial.C),
  })
  const toast = useToast()

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
    toast.success(t('toastSaved'))
  }

  const handleReset = () => {
    saveCadenceConfig(DEFAULT_CADENCE)
    setCadence({
      A: String(DEFAULT_CADENCE.A),
      B: String(DEFAULT_CADENCE.B),
      C: String(DEFAULT_CADENCE.C),
    })
    toast.success(t('toastSaved'))
  }

  return (
    <section style={{ marginTop: 'var(--space-3)' }}>
      <SectionHeader title={t('cadenceSettingsTitle')} />
      <div style={{ color: '#666', marginBottom: 12 }}>{t('cadenceSettingsDescription')}</div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <TextField
          label={t('cadenceTierALabel')}
          value={cadence.A}
          onChange={(value) => setCadence((prev) => ({ ...prev, A: value }))}
          type="number"
          dataTestId="cadence-a"
        />
        <TextField
          label={t('cadenceTierBLabel')}
          value={cadence.B}
          onChange={(value) => setCadence((prev) => ({ ...prev, B: value }))}
          type="number"
          dataTestId="cadence-b"
        />
        <TextField
          label={t('cadenceTierCLabel')}
          value={cadence.C}
          onChange={(value) => setCadence((prev) => ({ ...prev, C: value }))}
          type="number"
          dataTestId="cadence-c"
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={handleSave} dataTestId="cadence-save">
            {t('cadenceSave')}
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            {t('cadenceResetButton')}
          </Button>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: '#666' }}>{t('cadenceDaysLabel')}</div>
    </section>
  )
}
