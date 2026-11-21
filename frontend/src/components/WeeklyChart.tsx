import { useState } from 'react'
import type { WeekStats } from '../api'

export type ChartMetric = 'hard_sets' | 'workouts' | 'duration_min' | 'volume_kg'

const META: Record<ChartMetric, { label: string; unit: string }> = {
  hard_sets: { label: 'Hard sets per week', unit: 'sets' },
  workouts: { label: 'Workouts per week', unit: 'sessions' },
  duration_min: { label: 'Training time per week', unit: 'min' },
  volume_kg: { label: 'Working volume per week', unit: 'kg' },
}

function niceTicks(maxVal: number): number[] {
  const safeMax = Math.max(maxVal, 4)
  const raw = safeMax / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  let top = Math.ceil(safeMax / step) * step
  if (top <= maxVal) top += step
  const out: number[] = []
  for (let v = 0; v <= top + step * 0.01; v += step) {
    out.push(Math.round(v * 100) / 100)
  }
  return out
}

function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1]}`
}

export function WeeklyChart({ weekly, metric }: { weekly: WeekStats[]; metric: ChartMetric }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const meta = META[metric]

  const values = weekly.map((w) => Number(w[metric]))
  const maxVal = Math.max(0, ...values)
  const yTicks = niceTicks(maxVal)
  const yTop = yTicks[yTicks.length - 1] || 1

  const W = 600
  const H = 248
  const padL = 42
  const padR = 10
  const padT = 12
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const n = Math.max(weekly.length, 1)
  const slotW = plotW / n
  const barW = Math.max(8, Math.min(44, slotW * 0.58))

  // Pick evenly spaced x-labels (max 6)
  const step = n <= 6 ? 1 : Math.ceil(n / 6)

  const hovered = hoverIdx !== null ? weekly[hoverIdx] : null

  return (
    <div>
      <div className="panel-head">
        <div>
          <h2>{meta.label}</h2>
        </div>
        <span className="panel-meta num">
          {hovered
            ? `Wk of ${shortDate(hovered.week_start)}: ${Number(hovered[metric]).toLocaleString()} ${meta.unit}`
            : `Current week highlighted · ${weekly.length}w`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={meta.label}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => {
          const y = padT + plotH - (t / yTop) * plotH
          const isZero = t === 0
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke={isZero ? '#34343c' : '#1d1d22'}
                strokeWidth={isZero ? 1.5 : 1}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8e8e98"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t.toLocaleString()}
              </text>
            </g>
          )
        })}

        {weekly.map((w, i) => {
          const v = Number(w[metric])
          const barH = yTop > 0 ? (v / yTop) * plotH : 0
          const x = padL + i * slotW + (slotW - barW) / 2
          const y = padT + plotH - barH
          const isLast = i === weekly.length - 1
          const isHovered = i === hoverIdx
          const fill = isLast ? '#3b82f6' : isHovered ? '#525260' : '#2c2f3a'
          return (
            <g key={w.week_start} onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'default' }}>
              {/* Full-height invisible hover target */}
              <rect x={padL + i * slotW} y={padT} width={slotW} height={plotH} fill="transparent" />
              {v > 0 && <rect x={x} y={y} width={barW} height={Math.max(barH, 2)} fill={fill} />}
              {i % step === 0 && (
                <text
                  x={padL + i * slotW + slotW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill={isLast ? '#f4f4f5' : '#8e8e98'}
                >
                  {shortDate(w.week_start)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
