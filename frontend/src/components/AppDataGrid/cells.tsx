import { Box, LinearProgress } from '@mui/material'
import { SparkLineChart } from '@mui/x-charts'
import type { ReactNode } from 'react'
import type { UrgencyLabel } from '../../types'

/** Repeated status palette (mirrors the Tailwind tokens used across the app). */
export const TONES = {
  urgent: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  prompt: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  routine: { bg: '#f7f9fb', fg: '#46566e', bd: '#e1e7ee' },
  sky: { bg: '#f0f9ff', fg: '#0369a1', bd: '#bae6fd' },
  violet: { bg: '#f5f3ff', fg: '#6d28d9', bd: '#ddd6fe' },
  emerald: { bg: '#ecfdf5', fg: '#047857', bd: '#a7f3d0' },
  rose: { bg: '#fff1f2', fg: '#be123c', bd: '#fecdd3' },
  ink: { bg: '#eef2f6', fg: '#46566e', bd: '#e1e7ee' },
  amber: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
} as const

export type ToneKey = keyof typeof TONES

/** Small text chip. Text always accompanies the colour (a11y — never colour-only). */
export function StatusPill({ tone, children }: { tone: ToneKey; children: ReactNode }) {
  const t = TONES[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        padding: '4px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

const URGENCY_TONE: Record<UrgencyLabel, { tone: ToneKey; label: string; dot: string }> = {
  urgent: { tone: 'urgent', label: 'Urgent', dot: '#e11d48' },
  prompt: { tone: 'prompt', label: 'Prompt', dot: '#f59e0b' },
  routine: { tone: 'routine', label: 'Routine', dot: '#94a1b2' },
}

export function UrgencyPill({ level }: { level: UrgencyLabel }) {
  const m = URGENCY_TONE[level]
  return (
    <StatusPill tone={m.tone}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: m.dot }} aria-hidden="true" />
      {m.label}
    </StatusPill>
  )
}

export function Dot({ color }: { color: string }) {
  return <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} aria-hidden="true" />
}

export function CompletenessCell({ value }: { value: number }) {
  const label = value >= 80 ? 'Good' : value >= 50 ? 'Partial' : 'Low'
  const color = value >= 90 ? '#059669' : value >= 70 ? '#2b9a85' : '#f59e0b'
  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0.5, justifyContent: 'center' }}>
      <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
        {value}% <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>({label})</Box>
      </Box>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={`Completeness ${value} percent`}
        sx={{
          height: 5,
          borderRadius: 999,
          backgroundColor: '#eef2f6',
          '& .MuiLinearProgress-bar': { backgroundColor: color, borderRadius: 999 },
        }}
      />
    </Box>
  )
}

/** Mini trend/volume chart used in table cells (MUI X Charts sparkline). */
export function TrendSparkline({
  data,
  color = '#2b9a85',
  width = 96,
  height = 34,
  variant = 'line',
}: {
  data: number[]
  color?: string
  width?: number
  height?: number
  variant?: 'line' | 'bar'
}) {
  if (!data.length) return <span className="text-ink-300">—</span>
  return (
    <Box sx={{ width, height }}>
      <SparkLineChart
        data={data}
        height={height}
        width={width}
        color={color}
        area={false}
        plotType={variant}
        curve="monotoneX"
        showTooltip
        sx={{
          '& .MuiChartsTooltip-root': { fontSize: 10 },
        }}
      />
    </Box>
  )
}

/** Compact bar-style trend for volume columns. */
export function TrendBars({ data, color = '#2b9a85' }: { data: number[]; color?: string }) {
  return (
    <Box sx={{ width: 90, height: 34 }}>
      <SparkLineChart
        data={data}
        height={34}
        width={90}
        color={color}
        plotType="bar"
        showTooltip
      />
    </Box>
  )
}