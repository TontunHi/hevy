import { useEffect, useState } from 'react'
import {
  api,
  type CoachExercisePlan,
  type CoachOverview,
  type EquipmentMap,
  type PushRoutineResult,
} from '../api'

type DraftExercise = {
  template_id: string
  weight_kg: number | null
  reps: number
  working_sets: number
}

function actionBadge(action: CoachExercisePlan['action']) {
  if (action === 'increase_weight') return <span className="status-dot pos">Load up</span>
  if (action === 'ceiling_switch') return <span className="status-dot warn">Ceiling</span>
  if (action === 'add_reps') return <span className="sub-cell">Add reps</span>
  return <span className="sub-cell">Bodyweight</span>
}

export function CoachView() {
  const [data, setData] = useState<CoachOverview | null>(null)
  const [eqMap, setEqMap] = useState<EquipmentMap>({})
  const [selectedSplit, setSelectedSplit] = useState<string>('')
  const [routineTitle, setRoutineTitle] = useState<string>('')
  const [drafts, setDrafts] = useState<Record<string, DraftExercise>>({})
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState<PushRoutineResult | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    Promise.all([api.coach(), api.equipment()])
      .then(([coach, eq]) => {
        if (!alive) return
        setData(coach)
        setEqMap(eq.equipment)
        const first = coach.recommended_split ?? coach.splits[0]?.split ?? ''
        setSelectedSplit(first)
        const plan = coach.splits.find((s) => s.split === first)
        if (plan) {
          setRoutineTitle(plan.routine_title)
          const map: Record<string, DraftExercise> = {}
          for (const e of plan.exercises) {
            map[e.template_id] = {
              template_id: e.template_id,
              weight_kg: e.target_weight_kg,
              reps: e.target_reps,
              working_sets: e.working_sets,
            }
          }
          setDrafts(map)
        }
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])

  const selectSplit = (splitName: string) => {
    setSelectedSplit(splitName)
    setPushed(null)
    setError(undefined)
    const plan = data?.splits.find((s) => s.split === splitName)
    if (plan) {
      setRoutineTitle(plan.routine_title)
      const map: Record<string, DraftExercise> = {}
      for (const e of plan.exercises) {
        map[e.template_id] = {
          template_id: e.template_id,
          weight_kg: e.target_weight_kg,
          reps: e.target_reps,
          working_sets: e.working_sets,
        }
      }
      setDrafts(map)
    }
  }

  const updateDraft = (tplId: string, patch: Partial<DraftExercise>) => {
    setDrafts((prev) => ({
      ...prev,
      [tplId]: { ...prev[tplId], ...patch },
    }))
  }

  if (error && !data) return <div className="notice-error">{error}</div>
  if (!data) return <p className="sub-cell">Building progression plan…</p>

  const active = data.splits.find((s) => s.split === selectedSplit) ?? data.splits[0]
  if (!active) return <p className="sub-cell">Sync workouts first to generate coaching plans.</p>

  const stepUps = active.exercises.filter((e) => e.action === 'increase_weight').length
  const totalSets = active.exercises.reduce(
    (acc, e) => acc + (drafts[e.template_id]?.working_sets ?? e.working_sets),
    0,
  )

  const pushToHevy = async () => {
    setPushing(true)
    setError(undefined)
    setPushed(null)
    try {
      const res = await api.pushRoutine(active.split, {
        routine_title: routineTitle.trim() || active.routine_title,
        notes: active.notes,
        exercises: active.exercises.map((e) => {
          const d = drafts[e.template_id]
          return {
            template_id: e.template_id,
            weight_kg: d?.weight_kg ?? e.target_weight_kg,
            reps: d?.reps ?? e.target_reps,
            working_sets: d?.working_sets ?? e.working_sets,
            rest_seconds: e.rest_seconds,
            notes: e.reason,
          }
        }),
      })
      setPushed(res)
    } catch (err) {
      setError(String(err))
    } finally {
      setPushing(false)
    }
  }

  return (
    <div className="stack">
      {/* Split switcher + summary strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="segmented" role="group" aria-label="Choose split">
          {data.splits.map((s) => (
            <button
              key={s.split}
              aria-pressed={s.split === active.split}
              onClick={() => selectSplit(s.split)}
            >
              {s.split} ({s.days_ago}d)
              {s.split === data.recommended_split ? ' · Next' : ''}
            </button>
          ))}
        </div>

        <span className="panel-meta num">
          {active.exercises.length} exercises · {totalSets} working sets · {stepUps} load step-up(s)
        </span>
      </div>

      {error && <div className="notice-error">{error}</div>}

      {pushed && (
        <div
          className="panel"
          style={{
            borderColor: '#1f4b32',
            background: '#102218',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong style={{ color: 'var(--pill-positive-ink)' }}>
              {pushed.action === 'created' ? 'Created' : 'Updated'} "{pushed.routine_title}" in Hevy
            </strong>
            <div className="sub-cell">
              Folder: {pushed.folder_title} · {pushed.exercise_count} exercises ready in the Hevy app
            </div>
          </div>
          <span className="pill pill-pos">Synced to Hevy</span>
        </div>
      )}

      {/* Main grid: Prescribed routine (8 cols) + Muscle gaps & Push panel (4 cols) */}
      <div className="grid-12" style={{ alignItems: 'start' }}>
        <div className="panel span-8">
          <div className="panel-head" style={{ flexWrap: 'wrap' }}>
            <div>
              <h2>Next {active.split} prescription</h2>
              <p className="sub-cell" style={{ marginTop: 2 }}>
                Last played {active.last_date} ({active.days_ago}d ago) · adjust targets before pushing
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Action</th>
                <th className="num">Target load</th>
                <th className="num">Reps</th>
                <th className="num">Sets</th>
              </tr>
            </thead>
            <tbody>
              {active.exercises.map((e) => {
                const d = drafts[e.template_id] ?? {
                  template_id: e.template_id,
                  weight_kg: e.target_weight_kg,
                  reps: e.target_reps,
                  working_sets: e.working_sets,
                }
                const loads = e.equipment_key ? eqMap[e.equipment_key]?.loads ?? [] : []
                const activeLoad = loads.find((l) => l.total_kg === d.weight_kg) ?? e.plate_load

                return (
                  <tr key={e.template_id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.title}</div>
                      <div className="sub-cell" style={{ marginTop: 2 }}>
                        Last: <span className="num">{e.last_summary}</span>
                      </div>
                      <div className="sub-cell" style={{ color: 'var(--muted)', marginTop: 2 }}>
                        {e.reason}
                      </div>
                      {activeLoad && (
                        <div className="plate-chips" style={{ marginTop: 6 }}>
                          <span>Plates/side:</span>
                          {activeLoad.per_stack.length > 0 ? (
                            activeLoad.per_stack.map((p, i) => (
                              <span key={i} className="plate-disc num">
                                {p} kg
                              </span>
                            ))
                          ) : (
                            <span>empty bar</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: 'top', paddingTop: 14 }}>{actionBadge(e.action)}</td>
                    <td className="num" style={{ verticalAlign: 'top', paddingTop: 11 }}>
                      {loads.length > 0 && d.weight_kg !== null ? (
                        <select
                          aria-label={`Target load for ${e.title}`}
                          value={d.weight_kg}
                          onChange={(ev) =>
                            updateDraft(e.template_id, { weight_kg: Number(ev.target.value) })
                          }
                          className="field-input num"
                          style={{ height: 30, padding: '0 6px' }}
                        >
                          {loads.map((l) => (
                            <option key={l.total_kg} value={l.total_kg}>
                              {l.total_kg} kg
                            </option>
                          ))}
                        </select>
                      ) : d.weight_kg !== null ? (
                        `${d.weight_kg} kg`
                      ) : (
                        'BW'
                      )}
                    </td>
                    <td className="num" style={{ verticalAlign: 'top', paddingTop: 11 }}>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        aria-label={`Target reps for ${e.title}`}
                        value={d.reps}
                        onChange={(ev) =>
                          updateDraft(e.template_id, { reps: Math.max(1, Number(ev.target.value)) })
                        }
                        className="field-input num"
                        style={{ width: 58, height: 30, padding: '0 6px', textAlign: 'right' }}
                      />
                    </td>
                    <td className="num" style={{ verticalAlign: 'top', paddingTop: 11 }}>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        aria-label={`Working sets for ${e.title}`}
                        value={d.working_sets}
                        onChange={(ev) =>
                          updateDraft(e.template_id, {
                            working_sets: Math.max(1, Number(ev.target.value)),
                          })
                        }
                        className="field-input num"
                        style={{ width: 52, height: 30, padding: '0 6px', textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>

        <div className="span-4 stack">
          <div className="panel">
            <div className="panel-head">
              <h2>Export to Hevy</h2>
              <span className="panel-meta">Folder: Hevy Ledger</span>
            </div>

            <div className="stack" style={{ gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Routine title</span>
                <input
                  type="text"
                  value={routineTitle}
                  onChange={(e) => setRoutineTitle(e.target.value)}
                  className="field-input"
                />
              </label>

              <p className="sub-cell">
                Creates or updates this routine inside the "Hevy Ledger" folder in your Hevy account.
              </p>

              <button
                className="btn-primary"
                style={{ width: '100%', height: 36 }}
                disabled={pushing}
                onClick={pushToHevy}
              >
                {pushing ? 'Saving to Hevy…' : `Save "${routineTitle || active.routine_title}" to Hevy`}
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Muscle gaps ({active.split})</h2>
              <span className="panel-meta">Under 10 sets/wk</span>
            </div>

            {active.muscle_gaps.length === 0 ? (
              <p className="sub-cell">All muscles for this split are in the 10–20 set zone.</p>
            ) : (
              <div>
                {active.muscle_gaps.map((g) => (
                  <div key={g.muscle} className="split-row">
                    <div>
                      <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>
                        {g.muscle.replace(/_/g, ' ')}
                      </div>
                      <div className="sub-cell">{g.suggestion}</div>
                    </div>
                    <span className="pill pill-warn num">{g.weekly_rate}/wk</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
