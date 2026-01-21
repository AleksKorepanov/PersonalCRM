import ru, { type RuKey } from './ru'

const fallbackPrefix = '[i18n]'

export function t(key: RuKey): string {
  const value = ru[key]
  if (value) return value
  return `${fallbackPrefix} ${key}`
}
