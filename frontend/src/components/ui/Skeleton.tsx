import React from 'react'

type SkeletonProps = {
  height?: number
  width?: string
  radius?: string
  style?: React.CSSProperties
  dataTestId?: string
}

export default function Skeleton({
  height = 14,
  width = '100%',
  radius = 'var(--radius-sm)',
  style,
  dataTestId,
}: SkeletonProps) {
  return (
    <div
      data-testid={dataTestId}
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #f3f3f3 25%, #ececec 37%, #f3f3f3 63%)',
        backgroundSize: '400% 100%',
        animation: 'skeleton-loading 1.4s ease infinite',
        ...style,
      }}
    />
  )
}
