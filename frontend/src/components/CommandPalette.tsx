import React, { useEffect, useMemo } from 'react'
import { t } from '../i18n/t'
import type { Contact } from '../types'
import Card from './ui/Card'
import Divider from './ui/Divider'
import TextField from './ui/TextField'

type CommandItem = {
  id: string
  label: string
  onSelect: () => void
}

type CommandPaletteProps = {
  open: boolean
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  commands: CommandItem[]
  contacts: Contact[]
  onSelectContact: (contactId: string) => void
}

export default function CommandPalette({
  open,
  query,
  onQueryChange,
  onClose,
  commands,
  contacts,
  onSelectContact,
}: CommandPaletteProps) {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredCommands = useMemo(
    () => commands.filter((cmd) => cmd.label.toLowerCase().includes(normalizedQuery)),
    [commands, normalizedQuery],
  )
  const filteredContacts = useMemo(() => {
    if (!normalizedQuery) return contacts.slice(0, 10)
    return contacts.filter((contact) => contact.display_name.toLowerCase().includes(normalizedQuery)).slice(0, 10)
  }, [contacts, normalizedQuery])

  if (!open) return null

  return (
    <div
      data-testid="command-palette-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-4)',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div style={{ width: '100%', maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
        <Card padding="var(--space-4)" dataTestId="command-palette">
          <div style={{ fontWeight: 600, marginBottom: 'var(--space-3)', fontSize: 'var(--font-lg)' }}>
            {t('commandPaletteTitle')}
          </div>
          <TextField
            label={t('commandPaletteSearchLabel')}
            placeholder={t('commandPalettePlaceholder')}
            value={query}
            onChange={onQueryChange}
            dataTestId="command-search"
          />
          <Divider />
          {filteredCommands.length === 0 && filteredContacts.length === 0 && (
            <div style={{ color: 'var(--color-muted)', fontSize: 'var(--font-sm)' }}>{t('commandPaletteNoResults')}</div>
          )}
          {filteredCommands.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }} data-testid="command-section-commands">
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-muted)' }}>
                {t('commandPaletteSectionCommands')}
              </div>
              {filteredCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  data-testid={`command-item-${cmd.id}`}
                  onClick={cmd.onSelect}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                  }}
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          )}
          {filteredContacts.length > 0 && (
            <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }} data-testid="command-section-contacts">
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-muted)' }}>
                {t('commandPaletteSectionContacts')}
              </div>
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  data-testid={`command-contact-${contact.id}`}
                  onClick={() => onSelectContact(contact.id)}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    cursor: 'pointer',
                  }}
                >
                  {contact.display_name}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
