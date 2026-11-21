import { useEffect, useState } from 'react'
import { api, type MusclesReport } from '../api'
import { MuscleMapSvg } from '../components/MuscleMapSvg'

function formatMuscle(name: string) {
  return name.replace(/_/g, ' ')
}

function freshnessDot(freshness: string) {
  if (freshness.startsWith('Ready')) return 'status-dot pos'
  if (freshness.startsWith('Recovering')) return 'status-dot warn'
  if (freshness.startsWith('Fatigued')) return 'status-dot neg'
  return 'sub-cell'
}

export function MusclesView() {
  const [days, setDays] = useState<number>(7)
  const [report, setReport] = useState<MusclesReport | null>(null)
  const [selected, setSelected] = useState<string>('shoulders')
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    api
      .muscles(days)
      .then((r) => {
        if (!alive) return
        setReport(r)
        if (r.muscles.length > 0 && !r.muscles.some((m) => m.muscle === selected)) {
          setSelected(r.muscles[0].muscle)
        }
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [days, selected])

  if (error) return <div className="notice-error">{error}</div>
  if (!report) return <p className="sub-cell">Loading muscle breakdown…</p>

  const active = report.muscles.find((m) => m.muscle === selected) ?? report.muscles[0]
  const pushPull =
    report.pull_sets > 0 ? `${(report.push_sets / report.pull_sets).toFixed(1)} : 1` : '—'
  const upperLower =
    report.lower_sets > 0 ? `${(report.upper_sets / report.lower_sets).toFixed(1)} : 1` : '—'

  return (
    <div className="stack">
      {/* Top control & balance summary */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Push sets ({days}d)</span>
          <div className="kpi-val num">{report.push_sets}</div>
          <span className="kpi-delta">Chest, shoulders, triceps</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Pull sets ({days}d)</span>
          <div className="kpi-val num">{report.pull_sets}</div>
          <span className="kpi-delta num">Push : Pull = {pushPull}</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Upper : Lower ({days}d)</span>
          <div className="kpi-val num">{upperLower}</div>
          <span className="kpi-delta num">
            {report.upper_sets} upper · {report.lower_sets} lower
          </span>
        </div>
        <div className="kpi-cell" style={{ justifyContent: 'center' }}>
          <span className="kpi-label">Window</span>
          <div className="segmented" style={{ marginTop: 4 }} role="group" aria-label="Window days">
            {[7, 14, 30].map((d) => (
              <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body map + Selected muscle breakdown */}
      <div className="grid-12" style={{ alignItems: 'start' }}>
        <div className="panel span-5" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="panel-head" style={{ marginBottom: 8 }}>
              <h2>Anatomical volume map</h2>
              <span className="panel-meta num">Weekly rate</span>
            </div>
            <MuscleMapSvg muscles={report.muscles} selected={selected} onSelect={setSelected} />
          </div>

          {active && (
            <div
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 14,
                marginTop: 'auto',
              }}
            >
              <div className="panel-head" style={{ marginBottom: 8 }}>
                <h2 style={{ textTransform: 'capitalize' }}>{formatMuscle(active.muscle)}</h2>
                <span className={freshnessDot(active.freshness)}>{active.freshness}</span>
              </div>
              <p className="sub-cell num" style={{ marginBottom: 10 }}>
                {active.sets} sets in {days}d ({active.weekly_rate}/wk vs 10–20 target) ·{' '}
                {active.hours_since !== null ? `last trained ${active.hours_since}h ago` : 'not trained yet'}
              </p>

              {active.exercises.length === 0 ? (
                <p className="sub-cell">No exercises hit this muscle in the last {days} days.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Exercise</th>
                      <th>Role</th>
                      <th className="num">Sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.exercises.slice(0, 4).map((e) => (
                      <tr key={e.template_id}>
                        <td style={{ fontWeight: 500 }}>{e.title}</td>
                        <td>
                          <span className="pill pill-neutral">{e.role}</span>
                        </td>
                        <td className="num">{e.sets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* All muscles recovery & weekly rate table */}
        <div className="panel span-7">
          <div className="panel-head">
            <h2>Volume &amp; recovery by muscle</h2>
            <span className="panel-meta num">Target 10–20 sets/wk</span>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Muscle</th>
                <th className="num">{days}d sets</th>
                <th className="num">Weekly rate</th>
                <th className="num">Last trained</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {report.muscles.map((m) => (
                <tr
                  key={m.muscle}
                  className="clickable"
                  style={{ background: m.muscle === selected ? 'var(--raised)' : undefined }}
                  onClick={() => setSelected(m.muscle)}
                >
                  <td style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                    {formatMuscle(m.muscle)}
                  </td>
                  <td className="num">{m.sets}</td>
                  <td className="num">
                    <span
                      style={{
                        color:
                          m.weekly_rate >= 10 && m.weekly_rate <= 20
                            ? 'var(--positive)'
                            : m.weekly_rate === 0
                              ? 'var(--faint)'
                              : undefined,
                        fontWeight: m.weekly_rate >= 10 ? 500 : 400,
                      }}
                    >
                      {m.weekly_rate}/wk
                    </span>
                  </td>
                  <td className="num" style={{ color: 'var(--faint)' }}>
                    {m.hours_since !== null ? `${m.hours_since}h ago` : '—'}
                  </td>
                  <td>
                    <span className={freshnessDot(m.freshness)}>{m.freshness}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
