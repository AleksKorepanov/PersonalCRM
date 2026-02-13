import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { t } from '../i18n/t'
import Button from './ui/Button'
import Select from './ui/Select'
import TextField from './ui/TextField'
import type { SearchResults } from '../types'

type LayoutProps = {
  children: React.ReactNode
  searchQuery: string
  onSearchChange: (value: string) => void
  onSearchClear?: () => void
  searchResults?: SearchResults | null
  searchLoading?: boolean
  searchError?: string | null
  userEmail?: string | null
  roleLabel?: string
  isDevMode?: boolean
  devRole?: 'owner' | 'assistant'
  onDevRoleChange?: (value: 'owner' | 'assistant') => void
  onCreate?: () => void
}

export default function Layout({
  children,
  searchQuery,
  onSearchChange,
  onSearchClear,
  searchResults,
  searchLoading = false,
  searchError = null,
  userEmail,
  roleLabel,
  isDevMode = false,
  devRole = 'owner',
  onDevRoleChange,
  onCreate,
}: LayoutProps) {
  const navigate = useNavigate()
  const resolvedRoleLabel = roleLabel ?? t('roleOwner')
  const introStatusLabel = (status: string) => {
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
  const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
    display: 'block',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    textDecoration: 'none',
    color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
    background: isActive ? '#eef4ff' : 'transparent',
    fontSize: 'var(--font-md)',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ minHeight: '100vh' }}>
        <aside
          style={{
            position: 'fixed',
            inset: 0,
            right: 'auto',
            width: 'var(--layout-sidebar-width)',
            padding: 'var(--space-4)',
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 'var(--space-4)', fontSize: 'var(--font-lg)' }}>
            {t('appName')}
          </div>
          <nav style={{ display: 'grid', gap: 'var(--space-1)' }}>
            <NavLink data-testid="nav-contacts" to="/contacts" style={navLinkStyle}>
              {t('menuContacts')}
            </NavLink>
            <NavLink data-testid="nav-today" to="/today" style={navLinkStyle}>
              {t('menuToday')}
            </NavLink>
            <NavLink data-testid="nav-duplicates" to="/duplicates" style={navLinkStyle}>
              {t('menuDuplicates')}
            </NavLink>
            <NavLink data-testid="nav-reminders" to="/reminders" style={navLinkStyle}>
              {t('menuReminders')}
            </NavLink>
            <NavLink data-testid="nav-introductions" to="/introductions" style={navLinkStyle}>
              {t('menuIntroductions')}
            </NavLink>
            <NavLink data-testid="nav-projects" to="/projects" style={navLinkStyle}>
              {t('menuProjects')}
            </NavLink>
            <NavLink data-testid="nav-strategy" to="/strategy" style={navLinkStyle}>
              {t('menuStrategy')}
            </NavLink>
            <NavLink data-testid="nav-week" to="/week" style={navLinkStyle}>
              {t('menuWeekPanel')}
            </NavLink>
            <NavLink data-testid="nav-stale" to="/stale" style={navLinkStyle}>
              {t('menuStaleContacts')}
            </NavLink>
            <NavLink data-testid="nav-audit" to="/audit" style={navLinkStyle}>
              {t('menuAudit')}
            </NavLink>
            <NavLink data-testid="nav-iphone" to="/iphone" style={navLinkStyle}>
              {t('menuIPhone')}
            </NavLink>
            <NavLink data-testid="nav-settings" to="/settings" style={navLinkStyle}>
              {t('menuSettings')}
            </NavLink>
          </nav>
        </aside>

        <div
          style={{
            marginLeft: 'var(--layout-sidebar-width)',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
            }}
          >
            <div style={{ flex: 1, position: 'relative' }}>
              <TextField
                label={t('searchPlaceholder')}
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={onSearchChange}
                dataTestId="top-search"
              />
              {(searchLoading || searchError || (searchResults && searchQuery.trim().length >= 2)) && (
                <div
                  data-testid="global-search-results"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 'var(--space-2)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-md)',
                    zIndex: 50,
                    padding: 'var(--space-3)',
                    maxHeight: 360,
                    overflowY: 'auto',
                  }}
                >
                  {searchLoading && <div style={{ fontSize: 13 }}>{t('searchLoading')}</div>}
                  {searchError && (
                    <div style={{ fontSize: 13, color: '#b42318' }}>
                      {t('searchError')} {searchError}
                    </div>
                  )}
                  {!searchLoading && !searchError && searchResults && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('searchSectionContacts')}</div>
                        {searchResults.contacts.length === 0 ? (
                          <div style={{ fontSize: 13, color: '#666' }}>{t('searchEmptySection')}</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {searchResults.contacts.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  navigate(`/contacts/${item.id}`)
                                  onSearchClear?.()
                                }}
                                style={{
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid #eee',
                                  background: '#fafafa',
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{item.display_name}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>
                                  {item.organization?.name || item.company_name || item.company || t('emptyValue')}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('searchSectionProjects')}</div>
                        {searchResults.projects.length === 0 ? (
                          <div style={{ fontSize: 13, color: '#666' }}>{t('searchEmptySection')}</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {searchResults.projects.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  navigate('/projects')
                                  onSearchClear?.()
                                }}
                                style={{
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid #eee',
                                  background: '#fafafa',
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{item.name}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{t('searchSectionIntroductions')}</div>
                        {searchResults.introductions.length === 0 ? (
                          <div style={{ fontSize: 13, color: '#666' }}>{t('searchEmptySection')}</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {searchResults.introductions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  navigate('/introductions')
                                  onSearchClear?.()
                                }}
                                style={{
                                  textAlign: 'left',
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  border: '1px solid #eee',
                                  background: '#fafafa',
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>
                                  {item.requester_name || t('emptyValue')} → {item.target_name || t('emptyValue')}
                                </div>
                                <div style={{ fontSize: 12, color: '#666' }}>
                                  {t('searchIntroStatus')}: {introStatusLabel(item.status)}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!searchLoading && !searchError && searchResults && searchResults.contacts.length === 0 && searchResults.projects.length === 0 && searchResults.introductions.length === 0 && (
                    <div style={{ fontSize: 13, color: '#666' }}>{t('searchEmpty')}</div>
                  )}
                </div>
              )}
            </div>
            {isDevMode && onDevRoleChange ? (
              <div style={{ width: 180 }}>
                <Select
                  label={t('roleDevSwitchLabel')}
                  value={devRole}
                  onChange={(value) => onDevRoleChange(value as 'owner' | 'assistant')}
                  options={[
                    { value: 'owner', label: t('roleOwner') },
                    { value: 'assistant', label: t('roleAssistant') },
                  ]}
                  dataTestId="role-toggle"
                />
              </div>
            ) : null}
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text)' }} data-testid="role-indicator">
              {t('roleLabel')}: {resolvedRoleLabel}
            </div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--color-muted)' }}>
              {t('userLabel')}: {userEmail ?? t('emptyValue')}
            </div>
            <Button onClick={onCreate ?? (() => alert(t('createSoonAlert')))} dataTestId="create-button">
              {t('createButton')}
            </Button>
          </header>

          <main style={{ padding: 'var(--space-6) var(--space-6)', flex: 1 }}>
            <div style={{ maxWidth: 'var(--layout-content-max)', margin: '0 auto' }}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
