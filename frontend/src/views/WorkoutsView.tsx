import { useEffect, useMemo, useState } from 'react'
import { api, type WorkoutSummary } from '../api'

export function WorkoutsView({ onSelectWorkout }: { onSelectWorkout: (id: string) => void }) {
  const [rows, setRows] = useState<WorkoutSummary[]>([])
  const [split, setSplit] = useState<string>('ALL')
  const [error, setError] = useState<string>()

  useEffect(() => {
    api
      .workouts()
      .then(setRows)
      .catch((e) => setError(String(e)))
  }, [])

  const splits = useMemo(() => {
    const s = Array.from(new Set(rows.map((r) => r.title)))
    return ['ALL', ...s]
  }, [rows])

  const filtered = useMemo(
    () => (split === 'ALL' ? rows : rows.filter((r) => r.title === split)),
    [rows, split],
  )

  return (
    <div className="stack">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="segmented" role="group" aria-label="Filter by split">
          {splits.map((s) => (
            <button key={s} aria-pressed={split === s} onClick={() => setSplit(s)}>
              {s === 'ALL' ? `All (${rows.length})` : s}
            </button>
          ))}
        </div>
        <span className="panel-meta num">Click any session to inspect sets & plate math</span>
      </div>

      {error && <div className="notice-error">{error}</div>}

      <div className="panel" style={{ padding: '12px 20px' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Split</th>
              <th className="num">Exercises</th>
              <th className="num">Hard sets</th>
              <th className="num">Warmup</th>
              <th className="num">Duration</th>
              <th className="num">Volume</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.id} className="clickable" onClick={() => onSelectWorkout(w.id)}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{w.date}</td>
                <td style={{ fontWeight: 500 }}>{w.title}</td>
                <td className="num">{w.exercises}</td>
                <td className="num">{w.hard_sets}</td>
                <td className="num" style={{ color: 'var(--faint)' }}>
                  {w.warmup_sets}
                </td>
                <td className="num">{w.duration_min} min</td>
                <td className="num">{w.volume_kg.toLocaleString()} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
