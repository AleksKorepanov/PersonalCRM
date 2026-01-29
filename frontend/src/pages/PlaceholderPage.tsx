import React from 'react'

type PlaceholderPageProps = {
  title: string
  description: string
  testId?: string
}

export default function PlaceholderPage({ title, description, testId }: PlaceholderPageProps) {
  return (
    <section style={{ marginTop: 16 }} data-testid={testId}>
      <h2>{title}</h2>
      <div style={{ color: '#666' }}>{description}</div>
    </section>
  )
}
