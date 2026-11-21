import { useEffect, useState } from 'react'
import { api, type ReportsOverview } from '../api'

export function ReportsView() {
  const [period, setPeriod] = useState<'30d' | 'all'>('all')
  const [data, setData] = useState<ReportsOverview | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    api
      .reports(period)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [period])

  if (error) return <div className="notice-error">{error}</div>
  if (!data) return <p className="sub-cell">Building wrapped summary…</p>

  const w = data.wrapped

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(data.markdown_digest)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="stack">
      {/* Period switcher + Export backup */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="segmented" role="group" aria-label="Wrapped period">
          <button aria-pressed={period === '30d'} onClick={() => setPeriod('30d')}>
            Last 30 days
          </button>
          <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
            All time
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={() => api.downloadExport('csv')}>
            Export CSV
          </button>
          <button className="btn-ghost" onClick={() => api.downloadExport('json')}>
            Export JSON
          </button>
        </div>
      </div>

      {/* Wrapped KPI strip */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Total volume ({w.period})</span>
          <div>
            <span className="kpi-val num">{(w.total_volume_kg / 1000).toFixed(1)}</span>
            <span className="kpi-unit">tons</span>
          </div>
          <span className="kpi-delta num">
            {w.total_volume_kg.toLocaleString()} kg · ~{w.car_equivalents} cars
          </span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Sessions &amp; time</span>
          <div>
            <span className="kpi-val num">{w.workouts}</span>
            <span className="kpi-unit">sessions</span>
          </div>
          <span className="kpi-delta num">
            {w.total_minutes} min total (avg {w.avg_minutes} min)
          </span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Top exercise</span>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: '22px', marginTop: 4 }}>
            {w.favorite_exercise ? w.favorite_exercise[0] : '—'}
          </div>
          <span className="kpi-delta num">
            {w.favorite_exercise ? `${w.favorite_exercise[1]} hard sets` : 'No sets'}
            {w.favorite_muscle ? ` · #1 muscle: ${w.favorite_muscle[0]}` : ''}
          </span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Usual training slot</span>
          <div className="kpi-val num">{w.peak_hour ?? '—'}</div>
          <span className="kpi-delta">
            {w.peak_weekday ? `Most active on ${w.peak_weekday}` : 'No sessions yet'}
          </span>
        </div>
      </div>

      {/* Milestones (6 cols) + Weekly Markdown Digest (6 cols) */}
      <div className="grid-12" style={{ alignItems: 'stretch' }}>
        <div className="panel span-6">
          <div className="panel-head">
            <h2>Milestones</h2>
            <span className="panel-meta num">
              {data.milestones.filter((m) => m.achieved).length} of {data.milestones.length} achieved
            </span>
          </div>

          <div className="stack" style={{ gap: 14 }}>
            {data.milestones.map((m) => (
              <div key={m.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 5,
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{m.title}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="sub-cell num">
                      {m.current} / {m.target} {m.unit}
                    </span>
                    {m.achieved ? (
                      <span className="pill pill-pos">Achieved</span>
                    ) : (
                      <span className="pill pill-neutral num">{m.pct}%</span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    height: 8,
                    background: 'var(--raised)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  {m.pct > 0 && (
                    <div
                      style={{
                        width: `${m.pct}%`,
                        height: '100%',
                        background: m.achieved ? 'var(--positive)' : 'var(--chart-1)',
                        borderRadius: 999,
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="panel span-6"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div className="panel-head" style={{ marginBottom: 0 }}>
            <div>
              <h2>Weekly Markdown digest</h2>
              <p className="sub-cell" style={{ marginTop: 2 }}>
                Ready for notes, Telegram, or automated /schedule summaries
              </p>
            </div>
            <button className="btn-ghost" onClick={copyMarkdown}>
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
          </div>

          <pre
            style={{
              margin: 0,
              flex: 1,
              padding: 14,
              background: 'var(--ground)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-control)',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              lineHeight: '20px',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
            }}
          >
            {data.markdown_digest}
          </pre>

          {w.biggest_pr && (
            <div className="sub-cell">
              Latest headline PR: <strong style={{ color: 'var(--text)' }}>{w.biggest_pr}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
