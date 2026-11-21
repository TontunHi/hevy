import { useState } from 'react'
import type { Overview, WeekStats } from '../api'
import { Heatmap } from '../components/Heatmap'
import { MuscleTargetList } from '../components/MuscleTargetList'
import { WeeklyChart, type ChartMetric } from '../components/WeeklyChart'

function formatDelta(now: number, prev: number, unit: string) {
  const u = (n: number) => (unit === 'sessions' && Math.abs(n) === 1 ? 'session' : unit)
  if (prev === 0 && now === 0) return { text: '0 vs last wk', cls: '' }
  if (prev === 0) return { text: `+${now.toLocaleString()} ${u(now)} (new)`, cls: 'delta-pos' }
  const diff = now - prev
  if (diff === 0) return { text: '0 vs last wk', cls: '' }
  const sign = diff > 0 ? '+' : '−'
  const pct = Math.round((diff / prev) * 100)
  return {
    text: `${sign}${Math.abs(diff).toLocaleString()} ${u(diff)} (${diff > 0 ? '+' : '−'}${Math.abs(pct)}%) vs last wk`,
    cls: diff > 0 ? 'delta-pos' : 'delta-neg',
  }
}

const KPI_DEFS: { key: ChartMetric; label: string; unit: string }[] = [
  { key: 'hard_sets', label: 'Hard sets', unit: 'sets' },
  { key: 'workouts', label: 'Workouts', unit: 'sessions' },
  { key: 'duration_min', label: 'Duration', unit: 'min' },
  { key: 'volume_kg', label: 'Volume', unit: 'kg' },
]

export function OverviewView({
  data,
  onSelectWorkout,
  onViewAllWorkouts,
  onOpenCoach,
}: {
  data: Overview
  onSelectWorkout: (id: string) => void
  onViewAllWorkouts: () => void
  onOpenCoach: () => void
}) {
  const [metric, setMetric] = useState<ChartMetric>('hard_sets')

  const nextSplit = data.splits[0]
  const overdueBadge = (days: number) => {
    if (days >= 7) return 'pill-warn'
    if (days <= 1) return 'pill-neutral'
    return 'pill-pos'
  }

  return (
    <div className="stack">
      {/* Divided KPI strip: each cell switches the weekly chart below */}
      <div className="kpi-strip" role="tablist" aria-label="Weekly metrics">
        {KPI_DEFS.map((k) => {
          const cur = Number(data.this_week[k.key as keyof WeekStats])
          const prev = Number(data.last_week[k.key as keyof WeekStats])
          const d = formatDelta(cur, prev, k.unit)
          return (
            <button
              key={k.key}
              role="tab"
              aria-selected={metric === k.key}
              className="kpi-cell"
              onClick={() => setMetric(k.key)}
            >
              <span className="kpi-label">{k.label} (this wk)</span>
              <div>
                <span className="kpi-val num">{cur.toLocaleString()}</span>
                <span className="kpi-unit">{k.unit}</span>
              </div>
              <span className={`kpi-delta num ${d.cls}`}>{d.text}</span>
            </button>
          )
        })}
      </div>

      {/* Row 2: Weekly trend (8 cols) + Split rotation (4 cols) */}
      <div className="grid-12">
        <div className="panel span-8">
          <WeeklyChart weekly={data.weekly} metric={metric} />
        </div>

        <div className="panel span-4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <h2>Split rotation</h2>
            {nextSplit && (
              <button className="btn-ghost" onClick={onOpenCoach}>
                Plan {nextSplit.title} →
              </button>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {data.splits.length === 0 ? (
              <p className="sub-cell">No workouts logged yet.</p>
            ) : (
              data.splits.map((s, idx) => (
                <div key={s.title} className="split-row">
                  <div>
                    <div className="split-name">
                      {s.title}
                      {idx === 0 && <span className="pill pill-neutral">most overdue</span>}
                    </div>
                    <div className="split-meta num">
                      Last {s.last_date} · {s.sessions} sessions
                    </div>
                  </div>
                  <span className={`pill num ${overdueBadge(s.days_ago)}`}>
                    {s.days_ago === 0 ? 'Today' : s.days_ago === 1 ? '1d ago' : `${s.days_ago}d ago`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Muscle sets vs 10-20 target (7 cols) + Heatmap & Recent workouts (5 cols) */}
      <div className="grid-12" style={{ alignItems: 'stretch' }}>
        <div className="span-7" style={{ display: 'flex' }}>
          <MuscleTargetList muscles={data.muscles_7d} balance={data.balance_7d} />
        </div>

        <div className="span-5 stack">
          <Heatmap
            days={data.days}
            streakWeeks={data.totals.streak_weeks}
            totalWorkouts={data.totals.workouts}
          />

          <div className="panel" style={{ flex: 1 }}>
            <div className="panel-head">
              <h2>Recent workouts</h2>
              <button className="btn-ghost" onClick={onViewAllWorkouts}>
                View all ({data.totals.workouts})
              </button>
            </div>

            {data.recent_workouts.length === 0 ? (
              <p className="sub-cell">No workouts synced yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Session</th>
                    <th className="num">Sets</th>
                    <th className="num">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_workouts.slice(0, 4).map((w) => (
                    <tr
                      key={w.id}
                      className="clickable"
                      onClick={() => onSelectWorkout(w.id)}
                      title="Inspect exercises and plate loading"
                    >
                      <td>
                        <div style={{ fontWeight: 500 }}>{w.title}</div>
                        <div className="sub-cell num">
                          {w.date} · {w.duration_min} min · {w.exercises} ex
                        </div>
                      </td>
                      <td className="num">{w.hard_sets}</td>
                      <td className="num">{w.volume_kg.toLocaleString()} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
