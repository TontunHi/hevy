import { useEffect, useState } from 'react'
import { api, type WorkoutDetail } from '../api'

export function WorkoutDrawer({
  workoutId,
  onClose,
}: {
  workoutId: string | null
  onClose: () => void
}) {
  const [loaded, setLoaded] = useState<{ id: string; data?: WorkoutDetail; error?: string } | null>(
    null,
  )

  useEffect(() => {
    if (!workoutId) return
    let alive = true
    api
      .workoutDetail(workoutId)
      .then((data) => alive && setLoaded({ id: workoutId, data }))
      .catch((e) => alive && setLoaded({ id: workoutId, error: String(e) }))
    return () => {
      alive = false
    }
  }, [workoutId])

  const detail = loaded?.id === workoutId ? loaded.data ?? null : null
  const error = loaded?.id === workoutId ? loaded.error : undefined

  useEffect(() => {
    if (!workoutId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workoutId, onClose])

  if (!workoutId) return null

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="Workout details">
        <div className="drawer-head">
          <div>
            <h2>{detail?.title ?? 'Loading workout…'}</h2>
            {detail && (
              <p className="sub-cell num" style={{ marginTop: 2 }}>
                {new Date(detail.start_time).toLocaleString()} ·{' '}
                {Math.round(
                  (new Date(detail.end_time).getTime() - new Date(detail.start_time).getTime()) / 60000,
                )}{' '}
                min
              </p>
            )}
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="notice-error">{error}</div>}

        {detail &&
          detail.exercises.map((ex) => {
            const working = ex.sets.filter((s) => s.type !== 'warmup')
            const vol = working.reduce(
              (acc, s) => acc + (s.weight_kg ?? 0) * (s.reps ?? 0),
              0,
            )
            return (
              <div key={`${ex.index}-${ex.template_id}`} className="ex-card">
                <div className="ex-head">
                  <div>
                    <div className="ex-title">{ex.title}</div>
                    <div className="sub-cell" style={{ textTransform: 'capitalize' }}>
                      {ex.primary_muscle?.replace(/_/g, ' ') ?? '—'}
                      {ex.equipment_key ? ` · ${ex.equipment_key.replace(/_/g, ' ')}` : ''}
                    </div>
                  </div>
                  <span className="sub-cell num">{Math.round(vol).toLocaleString()} kg</span>
                </div>

                <table className="table">
                  <thead>
                    <tr>
                      <th>Set</th>
                      <th>Type</th>
                      <th className="num">Weight</th>
                      <th className="num">Reps</th>
                      <th className="num">RPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((s) => (
                      <tr key={s.index}>
                        <td className="num">{s.index + 1}</td>
                        <td>
                          <span
                            className={`pill ${s.type === 'warmup' ? 'pill-neutral' : 'pill-pos'}`}
                          >
                            {s.type}
                          </span>
                        </td>
                        <td className="num">{s.weight_kg !== null ? `${s.weight_kg} kg` : '—'}</td>
                        <td className="num">{s.reps !== null ? s.reps : '—'}</td>
                        <td className="num">{s.rpe !== null ? s.rpe : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {ex.plate_hint && (
                  <div className="plate-chips">
                    <span>Plates/side ({ex.plate_hint.total_kg} kg):</span>
                    {ex.plate_hint.per_stack.length > 0 ? (
                      ex.plate_hint.per_stack.map((p, idx) => (
                        <span key={idx} className="plate-disc num">
                          {p} kg
                        </span>
                      ))
                    ) : (
                      <span>empty bar</span>
                    )}
                    {ex.next_weight ? (
                      <span className="num" style={{ marginLeft: 'auto', color: 'var(--chart-1)' }}>
                        Next step: {ex.next_weight.total_kg} kg
                      </span>
                    ) : (
                      <span className="num" style={{ marginLeft: 'auto', color: 'var(--warning)' }}>
                        At plate ceiling
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
      </aside>
    </div>
  )
}
