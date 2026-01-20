import React, { useEffect, useMemo, useState } from 'react'

type MeResponse = {
  user_id: string
  email: string
  display_name?: string | null
}

export default function App() {
  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000', [])
  const [me, setMe] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${apiBase}/api/v1/me`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then(setMe)
      .catch((e) => setError(String(e)))
  }, [apiBase])

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24 }}>
      <h1>PersonalCRM</h1>
      <p style={{ color: '#666' }}>Starter UI (dev) — проверка соединения с backend.</p>

      <div style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>GET /api/v1/me</h2>
        {error && <pre style={{ whiteSpace: 'pre-wrap' }}>{error}</pre>}
        {!error && !me && <div>Loading…</div>}
        {me && (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(me, null, 2)}</pre>
        )}
      </div>

      <div style={{ marginTop: 16, color: '#666' }}>
        API Base URL: <code>{apiBase}</code>
      </div>
    </div>
  )
}
