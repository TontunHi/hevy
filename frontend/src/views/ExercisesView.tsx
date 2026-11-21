import { useEffect, useMemo, useState } from 'react'
import { api, type ExerciseDetail, type ExercisesOverview } from '../api'
import { ExerciseLineChart } from '../components/ExerciseLineChart'

type Filter = 'all' | 'pr' | 'plateau'

function statusPill(status: 'pr' | 'plateau' | 'building', sessionsSincePr: number) {
  if (status === 'pr') return <span className="status-dot pos">PR last session</span>
  if (status === 'plateau') return <span className="status-dot warn">Flat ({sessionsSincePr} sess)</span>
  return <span className="sub-cell">Building</span>
}

export function ExercisesView() {
  const [overview, setOverview] = useState<ExercisesOverview | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ExerciseDetail | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    api
      .exercises()
      .then((data) => {
        if (!alive) return
        setOverview(data)
        if (data.exercises.length > 0) {
          setSelectedId((prev) => prev ?? data.exercises[0].template_id)
        }
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let alive = true
    api
      .exerciseDetail(selectedId)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [selectedId])

  const filtered = useMemo(() => {
    if (!overview) return []
    const q = query.trim().toLowerCase()
    return overview.exercises.filter((ex) => {
      if (filter === 'pr' && ex.status !== 'pr') return false
      if (filter === 'plateau' && ex.status !== 'plateau') return false
      if (!q) return true
      return (
        ex.title.toLowerCase().includes(q) ||
        (ex.primary_muscle ?? '').toLowerCase().includes(q)
      )
    })
  }, [overview, filter, query])

  if (error) {
    return <div className="notice-error">{error}</div>
  }
  if (!overview) {
    return <p className="sub-cell">Loading exercises…</p>
  }

  const prCount = overview.exercises.filter((e) => e.status === 'pr').length
  const plateauCount = overview.exercises.filter((e) => e.status === 'plateau').length

  return (
    <div className="stack">
      {/* Row 1: Selected exercise progression (7 cols) + Recent PR feed (5 cols) */}
      <div className="grid-12" style={{ alignItems: 'stretch' }}>
        <div className="panel span-7" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {detail ? (
            <>
              <div className="panel-head" style={{ marginBottom: 0 }}>
                <div>
                  <h2>{detail.title}</h2>
                  <p className="sub-cell" style={{ textTransform: 'capitalize', marginTop: 2 }}>
                    {detail.primary_muscle?.replace(/_/g, ' ') ?? '—'}
                    {detail.equipment_key ? ` · ${detail.equipment_key.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                {statusPill(detail.status, detail.sessions_since_pr)}
              </div>

              {/* 3 inline stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  borderTop: '1px solid var(--rule)',
                  borderBottom: '1px solid var(--rule)',
                  padding: '10px 0',
                  gap: 12,
                }}
              >
                <div>
                  <div className="sub-cell">Best e1RM</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>
                    {detail.best_e1rm !== null ? `${detail.best_e1rm} kg` : '—'}
                  </div>
                </div>
                <div>
                  <div className="sub-cell">Best set</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>
                    {detail.best_weight_kg !== null ? `${detail.best_weight_kg} kg` : 'BW'} ×{' '}
                    {detail.best_reps ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="sub-cell">Next loadable</div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 500 }}>
                    {detail.next_weight
                      ? `${detail.next_weight.total_kg} kg`
                      : detail.at_ceiling
                        ? 'At ceiling'
                        : '—'}
                  </div>
                </div>
              </div>

              <ExerciseLineChart history={detail.history} />

              {/* Session log table for this exercise */}
              <div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sets (working)</th>
                      <th className="num">e1RM</th>
                      <th className="num">PRs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history
                      .slice()
                      .reverse()
                      .slice(0, 5)
                      .map((h) => {
                        const working = h.sets.filter((s) => s.set_type !== 'warmup')
                        const setsSummary = working
                          .map((s) => `${s.weight_kg ?? 0}×${s.reps ?? 0}`)
                          .join(', ')
                        return (
                          <tr key={h.workout_id}>
                            <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              <div>{h.date}</div>
                              <div className="sub-cell">{h.workout_title}</div>
                            </td>
                            <td className="num" style={{ fontSize: 13 }}>
                              {setsSummary || '—'}
                            </td>
                            <td className="num" style={{ whiteSpace: 'nowrap' }}>
                              {h.best_e1rm !== null ? `${h.best_e1rm} kg` : '—'}
                            </td>
                            <td className="num">
                              {h.prs.length > 0 ? (
                                <span className="pill pill-pos">{h.prs[0]}</span>
                              ) : (
                                <span className="sub-cell">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="sub-cell">Select an exercise below.</p>
          )}
        </div>

        <div className="panel span-5" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <h2>Recent PR feed</h2>
            <span className="panel-meta num">{overview.pr_feed.length} recorded</span>
          </div>

          {overview.pr_feed.length === 0 ? (
            <p className="sub-cell">
              PRs appear once an exercise has 2+ sessions to compare against.
            </p>
          ) : (
            <div style={{ flex: 1 }}>
              {overview.pr_feed.slice(0, 10).map((p, idx) => (
                <div
                  key={`${p.workout_id}-${p.template_id}-${p.kind}-${idx}`}
                  className="split-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(p.template_id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.exercise_title}
                    </div>
                    <div className="split-meta num">
                      {p.date} · {p.kind}: {p.value_label}
                    </div>
                  </div>
                  <span className="pill pill-pos num">{p.delta_label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: All exercises table */}
      <div className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div className="segmented" role="group" aria-label="Filter exercises">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All ({overview.exercises.length})
            </button>
            <button aria-pressed={filter === 'pr'} onClick={() => setFilter('pr')}>
              PR last session ({prCount})
            </button>
            <button aria-pressed={filter === 'plateau'} onClick={() => setFilter('plateau')}>
              Flat ({plateauCount})
            </button>
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter exercise or muscle…"
            aria-label="Filter exercises"
            className="field-input"
            style={{ width: 240 }}
          />
        </div>

        {filtered.length === 0 ? (
          <p className="sub-cell">No exercises match this filter.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th className="num">Sessions</th>
                <th className="num">Latest</th>
                <th className="num">Best e1RM</th>
                <th className="num">e1RM change</th>
                <th>Status</th>
                <th className="num">Next load</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ex) => {
                const isSelected = ex.template_id === selectedId
                return (
                  <tr
                    key={ex.template_id}
                    className="clickable"
                    style={{ background: isSelected ? 'var(--raised)' : undefined }}
                    onClick={() => {
                      setSelectedId(ex.template_id)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    <td>
                      <div style={{ fontWeight: 500 }}>{ex.title}</div>
                      <div className="sub-cell" style={{ textTransform: 'capitalize' }}>
                        {ex.primary_muscle?.replace(/_/g, ' ') ?? '—'} · last {ex.days_ago}d ago
                      </div>
                    </td>
                    <td className="num">{ex.sessions}</td>
                    <td className="num">
                      {ex.latest_weight_kg !== null ? `${ex.latest_weight_kg} kg` : 'BW'} ×{' '}
                      {ex.latest_top_reps ?? '—'}
                    </td>
                    <td className="num">
                      {ex.best_e1rm !== null ? `${ex.best_e1rm} kg` : '—'}
                    </td>
                    <td className="num">
                      {ex.e1rm_delta === null ? (
                        <span className="sub-cell">—</span>
                      ) : (
                        <span
                          className={
                            ex.e1rm_delta > 0
                              ? 'delta-pos'
                              : ex.e1rm_delta < 0
                                ? 'delta-neg'
                                : 'sub-cell'
                          }
                        >
                          {ex.e1rm_delta > 0 ? '+' : ''}
                          {ex.e1rm_delta} kg
                        </span>
                      )}
                    </td>
                    <td>{statusPill(ex.status, ex.sessions_since_pr)}</td>
                    <td className="num">
                      {ex.next_weight_kg !== null ? (
                        `${ex.next_weight_kg} kg`
                      ) : ex.at_ceiling ? (
                        <span className="pill pill-warn">Ceiling</span>
                      ) : (
                        <span className="sub-cell">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
