export type CadenceTier = 'A' | 'B' | 'C'

export type CadenceConfig = {
  A: number
  B: number
  C: number
}

const CADENCE_STORAGE_KEY = 'cadenceConfig'
export const DEFAULT_CADENCE: CadenceConfig = { A: 30, B: 90, C: 180 }

export const loadCadenceConfig = (): CadenceConfig => {
  if (typeof window === 'undefined') return DEFAULT_CADENCE
  try {
    const raw = window.localStorage.getItem(CADENCE_STORAGE_KEY)
    if (!raw) return DEFAULT_CADENCE
    const parsed = JSON.parse(raw) as Partial<CadenceConfig>
    return {
      A: Number.isFinite(parsed.A) ? Number(parsed.A) : DEFAULT_CADENCE.A,
      B: Number.isFinite(parsed.B) ? Number(parsed.B) : DEFAULT_CADENCE.B,
      C: Number.isFinite(parsed.C) ? Number(parsed.C) : DEFAULT_CADENCE.C,
    }
  } catch {
    return DEFAULT_CADENCE
  }
}

export const saveCadenceConfig = (config: CadenceConfig) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CADENCE_STORAGE_KEY, JSON.stringify(config))
}

export const parseTierFromTags = (tags: string[] | undefined | null): CadenceTier | null => {
  const tag = (tags || []).find((item) => item.toLowerCase().startsWith('tier:'))
  if (!tag) return null
  const value = tag.split(':')[1]?.trim().toUpperCase()
  return value === 'A' || value === 'B' || value === 'C' ? value : null
}

export const applyTierToTags = (tags: string[] | undefined | null, tier: CadenceTier | null): string[] => {
  const base = (tags || []).filter((item) => !item.toLowerCase().startsWith('tier:'))
  if (tier) {
    return [...base, `tier:${tier}`]
  }
  return base
}
