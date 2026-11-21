import type { Overview } from '../api'

const TARGET_MIN = 10
const TARGET_MAX = 20
const SCALE_MAX = 25

function formatMuscle(name: string) {
  return name.replace(/_/g, ' ')
}

export function MuscleTargetList({
  muscles,
  balance,
}: {
  muscles: Overview['muscles_7d']
  balance: Overview['balance_7d']
}) {
  const pushPull =
    balance.pull_sets > 0 ? `${(balance.push_sets / balance.pull_sets).toFixed(1)} : 1` : '—'

  return (
    <div className="panel" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-head">
        <div>
          <h2>7-day muscle sets</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Target 10–20 effective sets/week (primary = 1, secondary = 0.5)
          </p>
        </div>
        <span className="panel-meta num">
          Push {balance.push_sets} : Pull {balance.pull_sets} ({pushPull})
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {muscles.map((m) => {
          const pct = Math.min(100, (m.sets / SCALE_MAX) * 100)
          const inZone = m.sets >= TARGET_MIN && m.sets <= TARGET_MAX
          const over = m.sets > TARGET_MAX
          return (
            <div key={m.muscle} className="muscle-row">
              <span className="muscle-name">{formatMuscle(m.muscle)}</span>
              <div className="muscle-track" title={`${m.sets} sets (target ${TARGET_MIN}–${TARGET_MAX})`}>
                <div
                  className="muscle-zone"
                  style={{
                    left: `${(TARGET_MIN / SCALE_MAX) * 100}%`,
                    width: `${((TARGET_MAX - TARGET_MIN) / SCALE_MAX) * 100}%`,
                  }}
                />
                {m.sets > 0 && (
                  <div
                    className={`muscle-fill ${inZone ? 'in-zone' : ''}`}
                    style={{
                      width: `${pct}%`,
                      background: over ? 'var(--warning)' : undefined,
                    }}
                  />
                )}
              </div>
              <span className={`muscle-val num ${m.sets === 0 ? 'zero' : ''}`}>
                {m.sets}
                <span style={{ fontSize: 12, color: 'var(--faint)', fontWeight: 400 }}> /20</span>
              </span>
            </div>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--rule)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          color: 'var(--muted)',
        }}
      >
        <span className="num">
          Upper {balance.upper_sets} sets · Lower {balance.lower_sets} sets
        </span>
        <span className="num">
          {muscles.filter((m) => m.sets >= TARGET_MIN && m.sets <= TARGET_MAX).length} of {muscles.length} in
          10–20 zone
        </span>
      </div>
    </div>
  )
}
