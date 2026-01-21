import React from 'react'
import { NavLink } from 'react-router-dom'

type LayoutProps = {
  children: React.ReactNode
  searchQuery: string
  onSearchChange: (value: string) => void
  userEmail?: string | null
  roleLabel?: string
  onCreate?: () => void
}

export default function Layout({
  children,
  searchQuery,
  onSearchChange,
  userEmail,
  roleLabel = 'Владелец',
  onCreate,
}: LayoutProps) {
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
          <div style={{ fontWeight: 700, marginBottom: 16 }}>PersonalCRM</div>
          <nav style={{ display: 'grid', gap: 4 }}>
            <NavLink data-testid="tab-contacts" to="/contacts" style={navLinkStyle}>
              Контакты
            </NavLink>
            <NavLink data-testid="tab-reminders" to="/reminders" style={navLinkStyle}>
              Напоминания
            </NavLink>
            <NavLink to="/introductions" style={navLinkStyle}>
              Интродукции
            </NavLink>
            <NavLink to="/projects" style={navLinkStyle}>
              Проекты
            </NavLink>
            <NavLink to="/strategy" style={navLinkStyle}>
              Стратегия
            </NavLink>
            <NavLink to="/audit" style={navLinkStyle}>
              Аудит
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
            <input
              placeholder="Поиск"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }}
            />
            <div style={{ fontSize: 14, color: '#444' }}>Роль: {roleLabel}</div>
            <div style={{ fontSize: 14, color: '#666' }}>Пользователь: {userEmail ?? '—'}</div>
            <button onClick={onCreate ?? (() => alert('Создание скоро появится'))}>Создать</button>
          </header>

          <main style={{ padding: 20, flex: 1 }}>{children}</main>
        </div>
      </div>
    </div>
  )
}
