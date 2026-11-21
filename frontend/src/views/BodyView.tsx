import { useEffect, useState, type FormEvent } from 'react'
import { api, type BodyOverview } from '../api'

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function BodyView() {
  const [body, setBody] = useState<BodyOverview | null>(null)
  const [date, setDate] = useState<string>(todayIso)
  const [weight, setWeight] = useState('')
  const [fat, setFat] = useState('')
  const [waist, setWaist] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    api
      .body()
      .then((b) => alive && setBody(b))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSavedMsg(undefined)
    setError(undefined)
    try {
      const payload = {
        date,
        weight_kg: weight ? Number(weight) : undefined,
        fat_percent: fat ? Number(fat) : undefined,
        waist: waist ? Number(waist) : undefined,
      }
      const updated = await api.logBody(payload)
      setBody(updated)
      setWeight('')
      setFat('')
      setWaist('')
      setSavedMsg(`Saved to Hevy for ${date}`)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (error && !body) return <div className="notice-error">{error}</div>
  if (!body) return <p className="sub-cell">Loading body measurements…</p>

  const topRel = body.relative_strength[0]
  const deltaText =
    body.weight_delta_kg === null
      ? 'Need 2+ entries to compare'
      : body.weight_delta_kg === 0
        ? '0 kg vs previous entry'
        : `${body.weight_delta_kg > 0 ? '+' : ''}${body.weight_delta_kg} kg vs previous`

  return (
    <div className="stack">
      <div className="kpi-strip kpi-strip-3">
        <div className="kpi-cell">
          <span className="kpi-label">Current bodyweight</span>
          <div>
            <span className="kpi-val num">
              {body.latest_weight_kg !== null ? body.latest_weight_kg : '—'}
            </span>
            {body.latest_weight_kg !== null && <span className="kpi-unit">kg</span>}
          </div>
          <span className="kpi-delta num">{body.latest_date ?? 'No logs'}</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Weight change</span>
          <div>
            <span className="kpi-val num">
              {body.weight_delta_kg !== null
                ? `${body.weight_delta_kg > 0 ? '+' : ''}${body.weight_delta_kg}`
                : '—'}
            </span>
            {body.weight_delta_kg !== null && <span className="kpi-unit">kg</span>}
          </div>
          <span className="kpi-delta">{deltaText}</span>
        </div>

        <div className="kpi-cell">
          <span className="kpi-label">Top strength-to-BW</span>
          <div>
            <span className="kpi-val num">{topRel ? `${topRel.ratio}×` : '—'}</span>
          </div>
          <span className="kpi-delta">{topRel ? topRel.title : 'No weighted lifts'}</span>
        </div>
      </div>

      {error && <div className="notice-error">{error}</div>}

      <div className="grid-12" style={{ alignItems: 'start' }}>
        {/* Left: Log measurement form + Measurement history */}
        <div className="span-5 stack">
          <form className="panel" onSubmit={submit}>
            <div className="panel-head">
              <h2>Log measurement</h2>
              <span className="panel-meta">Syncs directly to Hevy</span>
            </div>

            <div className="stack" style={{ gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="field-input"
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="400"
                    placeholder="128.0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="field-input"
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Body fat (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="3"
                    max="70"
                    placeholder="Optional"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="field-input"
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Waist (cm)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="40"
                    max="250"
                    placeholder="Optional"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    className="field-input"
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span className="sub-cell" style={{ color: savedMsg ? 'var(--positive)' : undefined }}>
                  {savedMsg ?? 'Updates existing date if already logged'}
                </span>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || (!weight && !fat && !waist)}
                >
                  {saving ? 'Saving…' : 'Save to Hevy'}
                </button>
              </div>
            </div>
          </form>

          <div className="panel">
            <div className="panel-head">
              <h2>Measurement log</h2>
              <span className="panel-meta num">{body.measurements.length} entries</span>
            </div>

            {body.measurements.length === 0 ? (
              <p className="sub-cell">No body measurements logged yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Weight</th>
                    <th className="num">Fat %</th>
                    <th className="num">Waist</th>
                  </tr>
                </thead>
                <tbody>
                  {body.measurements.map((m) => (
                    <tr key={m.date}>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{m.date}</td>
                      <td className="num" style={{ fontWeight: 500 }}>
                        {m.weight_kg != null ? `${m.weight_kg} kg` : '—'}
                      </td>
                      <td className="num">{m.fat_percent != null ? `${m.fat_percent}%` : '—'}</td>
                      <td className="num">{m.waist != null ? `${m.waist} cm` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Strength-to-Bodyweight ratios */}
        <div className="panel span-7">
          <div className="panel-head">
            <div>
              <h2>Strength-to-bodyweight</h2>
              <p className="sub-cell" style={{ marginTop: 2 }}>
                Best Epley e1RM divided by {body.latest_weight_kg ?? '—'} kg bodyweight
              </p>
            </div>
            <span className="panel-meta">Top 6 lifts</span>
          </div>

          {body.relative_strength.length === 0 ? (
            <p className="sub-cell">Log both a bodyweight and weighted lifts to compute ratios.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th className="num">Latest</th>
                  <th className="num">Best e1RM</th>
                  <th className="num">e1RM / BW</th>
                </tr>
              </thead>
              <tbody>
                {body.relative_strength.slice(0, 6).map((r) => (
                  <tr key={r.template_id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.title}</div>
                      <div className="sub-cell" style={{ textTransform: 'capitalize' }}>
                        {r.primary_muscle?.replace(/_/g, ' ') ?? '—'}
                      </div>
                    </td>
                    <td className="num">
                      {r.latest_weight_kg ?? '—'} kg × {r.latest_top_reps ?? '—'}
                    </td>
                    <td className="num">{r.best_e1rm} kg</td>
                    <td className="num" style={{ fontWeight: 600, color: 'var(--chart-1)' }}>
                      {r.ratio.toFixed(2)}×
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
