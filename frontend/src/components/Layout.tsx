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
    padding: '10px 12px',
    borderRadius: 8,
    textDecoration: 'none',
    color: isActive ? '#0b5fff' : '#222',
    background: isActive ? '#eef4ff' : 'transparent',
  })

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', minHeight: '100vh' }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 240,
            padding: 16,
            borderRight: '1px solid #e6e6e6',
            background: '#fafafa',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 16 }}>{t('appName')}</div>
          <nav style={{ display: 'grid', gap: 4 }}>
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
          </nav>
        </aside>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 20px',
              borderBottom: '1px solid #e6e6e6',
              background: '#fff',
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
                    marginTop: 6,
                    background: '#fff',
                    border: '1px solid #e6e6e6',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                    zIndex: 50,
                    padding: 10,
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
            <div style={{ fontSize: 14, color: '#444' }} data-testid="role-indicator">
              {t('roleLabel')}: {resolvedRoleLabel}
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>
              {t('userLabel')}: {userEmail ?? t('emptyValue')}
            </div>
            <Button onClick={onCreate ?? (() => alert(t('createSoonAlert')))} dataTestId="create-button">
              {t('createButton')}
            </Button>
          </header>

          <main style={{ padding: 20, flex: 1 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}
