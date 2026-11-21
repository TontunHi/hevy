import { useState } from 'react'
import type { ExerciseSessionPoint } from '../api'

function niceScale(minVal: number, maxVal: number): number[] {
  const lo = Math.max(0, Math.floor(minVal * 0.85))
  const span = Math.max(maxVal - lo, 2)
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const start = Math.floor(lo / step) * step
  let top = Math.ceil(maxVal / step) * step
  if (top <= maxVal) top += step
  const out: number[] = []
  for (let v = start; v <= top + step * 0.01; v += step) {
    out.push(Math.round(v * 10) / 10)
  }
  return out
}

function shortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[(m ?? 1) - 1]}`
}

export function ExerciseLineChart({ history }: { history: ExerciseSessionPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const hasE1rm = history.some((h) => h.best_e1rm !== null)
  const points = history
    .map((h) => ({
      date: h.date,
      value: hasE1rm ? h.best_e1rm : h.top_reps,
      prs: h.prs,
      detail: hasE1rm
        ? `${h.best_e1rm ?? '—'} kg e1RM (${h.top_weight_kg ?? 0} kg × ${h.top_reps ?? 0})`
        : `${h.top_reps ?? 0} top reps`,
    }))
    .filter((p): p is { date: string; value: number; prs: string[]; detail: string } => p.value !== null)

  if (points.length === 0) {
    return <p className="sub-cell">No working sets recorded yet.</p>
  }

  const values = points.map((p) => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const yTicks = niceScale(minVal, maxVal)
  const yMin = yTicks[0] ?? 0
  const yMax = yTicks[yTicks.length - 1] ?? 1
  const ySpan = Math.max(yMax - yMin, 1)

  const W = 560
  const H = 190
  const padL = 42
  const padR = 16
  const padT = 14
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const xOf = (i: number) =>
    points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW
  const yOf = (v: number) => padT + plotH - ((v - yMin) / ySpan) * plotH

  const polyline = points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(' ')
  const hovered = hoverIdx !== null ? points[hoverIdx] : null
  const labelStep = points.length <= 6 ? 1 : Math.ceil(points.length / 6)

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>
          {hasE1rm ? 'Estimated 1RM (Epley, kg)' : 'Top working reps'}
        </span>
        <span className="panel-meta num">
          {hovered
            ? `${hovered.date} · ${hovered.detail}`
            : points.length === 1
              ? '1 session recorded'
              : `${points.length} sessions`}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={hasE1rm ? 'Estimated 1RM over time' : 'Top reps over time'}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t, idx) => {
          const y = yOf(t)
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke={idx === 0 ? '#34343c' : '#1d1d22'}
                strokeWidth={idx === 0 ? 1.5 : 1}
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8e8e98"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t}
              </text>
            </g>
          )
        })}

        {points.length > 1 && (
          <polyline fill="none" stroke="#3b82f6" strokeWidth={2.2} points={polyline} />
        )}

        {points.map((p, i) => {
          const cx = xOf(i)
          const cy = yOf(p.value)
          const isPr = p.prs.length > 0
          const isHov = hoverIdx === i
          return (
            <g key={`${p.date}-${i}`} onMouseEnter={() => setHoverIdx(i)}>
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              {(isPr || isHov || points.length === 1) && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHov ? 4.5 : 3.5}
                  fill={isPr ? '#3b82f6' : '#121215'}
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
              )}
              {i % labelStep === 0 && (
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
                  fontSize="11"
                  fill="#8e8e98"
                >
                  {shortDate(p.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
