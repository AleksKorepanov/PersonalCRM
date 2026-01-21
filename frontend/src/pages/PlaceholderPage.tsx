import React from 'react'

type PlaceholderPageProps = {
  title: string
  description: string
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section style={{ marginTop: 16 }}>
      <h2>{title}</h2>
      <div style={{ color: '#666' }}>{description}</div>
    </section>
  )
}
