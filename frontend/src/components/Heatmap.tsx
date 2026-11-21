import { useMemo, useState } from 'react'

type DayPoint = { date: string; workouts: number; hard_sets: number }

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function Heatmap({
  days,
  streakWeeks,
  totalWorkouts,
}: {
  days: DayPoint[]
  streakWeeks: number
  totalWorkouts: number
}) {
  const [hovered, setHovered] = useState<{ date: string; workouts: number; hard_sets: number } | null>(null)
  const [today] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const { weeks, maxSets } = useMemo(() => {
    const map = new Map<string, DayPoint>()
    let max = 0
    for (const d of days) {
      map.set(d.date, d)
      if (d.hard_sets > max) max = d.hard_sets
    }

    // Align end of grid to Sunday of current week, start 15 weeks earlier on Monday (16 weeks total)
    const dayOfWeekMon0 = (today.getDay() + 6) % 7 // Mon=0..Sun=6
    const endSunday = new Date(today)
    endSunday.setDate(today.getDate() + (6 - dayOfWeekMon0))

    const startMonday = new Date(endSunday)
    startMonday.setDate(endSunday.getDate() - (16 * 7 - 1))

    const cols: { date: string; workouts: number; hard_sets: number; future: boolean }[][] = []
    const cur = new Date(startMonday)
    for (let w = 0; w < 16; w++) {
      const col = []
      for (let r = 0; r < 7; r++) {
        const key = isoDate(cur)
        const rec = map.get(key)
        col.push({
          date: key,
          workouts: rec?.workouts ?? 0,
          hard_sets: rec?.hard_sets ?? 0,
          future: cur > today,
        })
        cur.setDate(cur.getDate() + 1)
      }
      cols.push(col)
    }
    return { weeks: cols, maxSets: Math.max(max, 12) }
  }, [days, today])

  const cellColor = (sets: number, future: boolean) => {
    if (future) return 'transparent'
    if (sets === 0) return '#1c1c22'
    const ratio = sets / maxSets
    if (ratio < 0.4) return '#1e3a5f'
    if (ratio < 0.75) return '#2563eb'
    return '#3b82f6'
  }

  const dayLabels = ['M', '', 'W', '', 'F', '', 'S']
  const size = 14
  const gap = 3
  const labelW = 16
  const svgW = labelW + 16 * (size + gap)
  const svgH = 7 * (size + gap)

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Consistency (16w)</h2>
        <span className="panel-meta num">
          {streakWeeks}w streak (≥2/wk) · {totalWorkouts} total
        </span>
      </div>

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        role="img"
        aria-label="16-week training calendar heatmap"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHovered(null)}
      >
        {dayLabels.map((lbl, r) =>
          lbl ? (
            <text key={r} x={0} y={r * (size + gap) + 11} fontSize="10" fill="#8e8e98">
              {lbl}
            </text>
          ) : null,
        )}
        {weeks.map((col, w) =>
          col.map((cell, r) => (
            <rect
              key={cell.date}
              x={labelW + w * (size + gap)}
              y={r * (size + gap)}
              width={size}
              height={size}
              rx={2}
              fill={cellColor(cell.hard_sets, cell.future)}
              stroke={cell.future ? 'none' : hovered?.date === cell.date ? '#f4f4f5' : 'none'}
              strokeWidth={1}
              onMouseEnter={() => !cell.future && setHovered(cell)}
            />
          )),
        )}
      </svg>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--faint)',
        }}
      >
        <span className="num">
          {hovered
            ? hovered.workouts > 0
              ? `${hovered.date} · ${hovered.workouts} workout · ${hovered.hard_sets} hard sets`
              : `${hovered.date} · Rest day`
            : 'Hover a day for set count'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Less
          {['#1c1c22', '#1e3a5f', '#2563eb', '#3b82f6'].map((c) => (
            <span
              key={c}
              style={{ width: 10, height: 10, borderRadius: 2, background: c, display: 'inline-block' }}
            />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
