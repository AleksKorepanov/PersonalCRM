import React from 'react'
import { NavLink } from 'react-router-dom'
import { t } from '../i18n/t'
import Button from './ui/Button'
import Select from './ui/Select'
import TextField from './ui/TextField'

type LayoutProps = {
  children: React.ReactNode
  searchQuery: string
  onSearchChange: (value: string) => void
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
  userEmail,
  roleLabel,
  isDevMode = false,
  devRole = 'owner',
  onDevRoleChange,
  onCreate,
}: LayoutProps) {
  const resolvedRoleLabel = roleLabel ?? t('roleOwner')
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
            <NavLink data-testid="tab-contacts" to="/contacts" style={navLinkStyle}>
              {t('menuContacts')}
            </NavLink>
            <NavLink data-testid="tab-reminders" to="/reminders" style={navLinkStyle}>
              {t('menuReminders')}
            </NavLink>
            <NavLink to="/introductions" style={navLinkStyle}>
              {t('menuIntroductions')}
            </NavLink>
            <NavLink to="/projects" style={navLinkStyle}>
              {t('menuProjects')}
            </NavLink>
            <NavLink to="/strategy" style={navLinkStyle}>
              {t('menuStrategy')}
            </NavLink>
            <NavLink to="/audit" style={navLinkStyle}>
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
            <div style={{ flex: 1 }}>
              <TextField
                label={t('searchPlaceholder')}
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={onSearchChange}
              />
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
                />
              </div>
            ) : null}
            <div style={{ fontSize: 14, color: '#444' }}>
              {t('roleLabel')}: {resolvedRoleLabel}
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>
              {t('userLabel')}: {userEmail ?? t('emptyValue')}
            </div>
            <Button onClick={onCreate ?? (() => alert(t('createSoonAlert')))}>{t('createButton')}</Button>
          </header>

          <main style={{ padding: 20, flex: 1 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}
