import React from 'react'

type DividerProps = {
  margin?: string
}

export default function Divider({ margin = 'var(--space-3) 0' }: DividerProps) {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin }} />
}
