import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type EquipmentConfig, type EquipmentEntry, type PlateItem } from '../api'

function plateHeight(kg: number): number {
  if (kg >= 10) return 58
  if (kg >= 5) return 50
  if (kg >= 2.5) return 44
  if (kg >= 2) return 38
  if (kg >= 1.5) return 32
  return 26
}

export function EquipmentView() {
  const [cfg, setCfg] = useState<EquipmentConfig | null>(null)
  const [plates, setPlates] = useState<PlateItem[]>([])
  const [equipment, setEquipment] = useState<Record<string, EquipmentEntry>>({})
  const [selected, setSelected] = useState<string>('dumbbell_pair')
  const [targetInput, setTargetInput] = useState<string>('')
  const [newKg, setNewKg] = useState<string>('')
  const [newCount, setNewCount] = useState<string>('2')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let alive = true
    api
      .equipment()
      .then((data) => {
        if (!alive) return
        setCfg(data)
        setPlates(data.plates)
        setEquipment(data.equipment)
        const keys = Object.keys(data.equipment)
        if (keys.length > 0 && !data.equipment[selected]) {
          setSelected(keys[0])
        }
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [selected])

  const active = equipment[selected]
  const keys = Object.keys(equipment)

  const totalPlateKg = useMemo(
    () => plates.reduce((acc, p) => acc + p.kg * p.count, 0),
    [plates],
  )
  const totalPlateCount = useMemo(
    () => plates.reduce((acc, p) => acc + p.count, 0),
    [plates],
  )

  const matchedLoad = useMemo(() => {
    if (!active || active.loads.length === 0) return null
    const val = Number(targetInput)
    if (!targetInput || !Number.isFinite(val)) return active.loads[active.loads.length - 1]
    const exact = active.loads.find((l) => Math.abs(l.total_kg - val) < 0.01)
    if (exact) return exact
    // Return closest loadable weight
    return active.loads.reduce((best, cur) =>
      Math.abs(cur.total_kg - val) < Math.abs(best.total_kg - val) ? cur : best,
    )
  }, [active, targetInput])

  const adjustPlateCount = (idx: number, delta: number) => {
    setPlates((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, count: Math.max(0, p.count + delta) } : p)),
    )
    setDirty(true)
    setSavedMsg(undefined)
  }

  const removePlate = (idx: number) => {
    setPlates((prev) => prev.filter((_, i) => i !== idx))
    setDirty(true)
    setSavedMsg(undefined)
  }

  const addPlate = (e: FormEvent) => {
    e.preventDefault()
    const kg = Number(newKg)
    const count = Math.max(1, Math.round(Number(newCount)))
    if (!Number.isFinite(kg) || kg <= 0) return
    setPlates((prev) => {
      const existing = prev.findIndex((p) => Math.abs(p.kg - kg) < 0.001)
      if (existing >= 0) {
        return prev.map((p, i) => (i === existing ? { ...p, count: p.count + count } : p))
      }
      return [...prev, { kg, count }].sort((a, b) => b.kg - a.kg)
    })
    setNewKg('')
    setNewCount('2')
    setDirty(true)
    setSavedMsg(undefined)
  }

  const updateBaseKg = (key: string, baseKg: number) => {
    if (!Number.isFinite(baseKg) || baseKg < 0) return
    setEquipment((prev) => ({
      ...prev,
      [key]: { ...prev[key], base_kg: baseKg },
    }))
    setDirty(true)
    setSavedMsg(undefined)
  }

  const saveConfig = async () => {
    setSaving(true)
    setError(undefined)
    setSavedMsg(undefined)
    try {
      const eqPayload: Record<string, Omit<EquipmentEntry, 'loads'>> = {}
      for (const [k, v] of Object.entries(equipment)) {
        eqPayload[k] = {
          label: v.label,
          stacks: v.stacks,
          counted: v.counted,
          base_kg: v.base_kg,
        }
      }
      const updated = await api.saveEquipment({
        plates: plates.filter((p) => p.count > 0),
        equipment: eqPayload,
      })
      setCfg(updated)
      setPlates(updated.plates)
      setEquipment(updated.equipment)
      setDirty(false)
      setSavedMsg('Saved to equipment.toml and recalculated Coach plans')
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (error && !cfg) return <div className="notice-error">{error}</div>
  if (!cfg) return <p className="sub-cell">Loading equipment configuration…</p>

  return (
    <div className="stack">
      {error && <div className="notice-error">{error}</div>}

      {/* Dynamic summary strip built from live plates */}
      <div className="kpi-strip">
        <div className="kpi-cell">
          <span className="kpi-label">Plate denominations</span>
          <div className="kpi-val num">{plates.filter((p) => p.count > 0).length}</div>
          <span className="kpi-delta">Synced from equipment.toml</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total plates</span>
          <div className="kpi-val num">{totalPlateCount}</div>
          <span className="kpi-delta num">
            {plates.map((p) => `${p.kg}×${p.count}`).join(' · ')}
          </span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Total plate pool</span>
          <div>
            <span className="kpi-val num">{totalPlateKg}</span>
            <span className="kpi-unit">kg</span>
          </div>
          <span className="kpi-delta">Shared across all bars</span>
        </div>
        <div className="kpi-cell">
          <span className="kpi-label">Active ceiling ({active?.label ?? '—'})</span>
          <div>
            <span className="kpi-val num">
              {active && active.loads.length > 0
                ? active.loads[active.loads.length - 1].total_kg
                : '—'}
            </span>
            <span className="kpi-unit">kg</span>
          </div>
          <span className="kpi-delta num">{active?.loads.length ?? 0} distinct steps</span>
        </div>
      </div>

      {/* Left: Dynamic Plate Inventory + Equipment Base Editor | Right: Target Calculator & Loadable Steps */}
      <div className="grid-12" style={{ alignItems: 'start' }}>
        <div className="span-5 stack">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Plate inventory</h2>
                <p className="sub-cell" style={{ marginTop: 2 }}>
                  Adjust counts or add plates — updates Coach &amp; Workouts
                </p>
              </div>
              <button
                className="btn-primary"
                disabled={!dirty || saving}
                onClick={saveConfig}
              >
                {saving ? 'Saving…' : 'Save gym config'}
              </button>
            </div>

            {savedMsg && (
              <div className="sub-cell" style={{ color: 'var(--positive)', marginBottom: 10 }}>
                {savedMsg}
              </div>
            )}

            <table className="table">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th className="num">Qty</th>
                  <th className="num">Subtotal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plates.map((p, idx) => (
                  <tr key={p.kg}>
                    <td className="num" style={{ fontWeight: 500 }}>
                      {p.kg} kg
                    </td>
                    <td className="num">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ height: 24, padding: '0 8px' }}
                          onClick={() => adjustPlateCount(idx, -1)}
                        >
                          −
                        </button>
                        <span style={{ minWidth: 20, textAlign: 'center' }}>{p.count}</span>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ height: 24, padding: '0 8px' }}
                          onClick={() => adjustPlateCount(idx, 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>
                      {(p.kg * p.count).toFixed(1)} kg
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ height: 24, padding: '0 8px', color: 'var(--faint)' }}
                        onClick={() => removePlate(idx)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form
              onSubmit={addPlate}
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--rule)',
              }}
            >
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="50"
                placeholder="kg (e.g. 5)"
                value={newKg}
                onChange={(e) => setNewKg(e.target.value)}
                className="field-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              <input
                type="number"
                min="1"
                max="32"
                placeholder="Qty"
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
                className="field-input"
                style={{ width: 68 }}
              />
              <button type="submit" className="btn-ghost" style={{ height: 34 }}>
                + Add plate
              </button>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Bar &amp; stack settings</h2>
              <span className="panel-meta">Base handle/bar weight</span>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th className="num">Stacks</th>
                  <th className="num">Base (kg)</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const e = equipment[k]
                  return (
                    <tr key={k}>
                      <td style={{ fontWeight: 500 }}>{e.label}</td>
                      <td className="num" style={{ color: 'var(--faint)' }}>
                        {e.stacks}
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="50"
                          value={e.base_kg}
                          onChange={(ev) => updateBaseKg(k, Number(ev.target.value))}
                          className="field-input num"
                          style={{ width: 72, height: 28, textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Visual Sleeve Stacker + All Loadable Steps */}
        <div className="panel span-7">
          <div className="panel-head" style={{ flexWrap: 'wrap' }}>
            <div>
              <h2>Loadable weights &amp; plate visualizer</h2>
              <p className="sub-cell" style={{ marginTop: 2 }}>
                Click any weight below or type a target to preview exact plates per side
              </p>
            </div>
            <div className="segmented" role="group" aria-label="Select equipment">
              {keys.map((k) => (
                <button key={k} aria-pressed={selected === k} onClick={() => setSelected(k)}>
                  {equipment[k].label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive target calculator + visual sleeve */}
          {active && (
            <div style={{ marginBottom: 16 }} className="stack">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="sub-cell">Target weight (kg):</span>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={String(active.loads[active.loads.length - 1]?.total_kg ?? 8)}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="field-input num"
                    style={{ width: 96 }}
                  />
                </label>
                {matchedLoad && (
                  <span className="sub-cell num">
                    Closest loadable:{' '}
                    <strong style={{ color: 'var(--text)' }}>{matchedLoad.total_kg} kg</strong>
                    {targetInput && Math.abs(matchedLoad.total_kg - Number(targetInput)) >= 0.01
                      ? ` (${matchedLoad.total_kg > Number(targetInput) ? '+' : ''}${(matchedLoad.total_kg - Number(targetInput)).toFixed(1)} kg)`
                      : ''}
                  </span>
                )}
              </div>

              {matchedLoad && (
                <div className="bar-visual" aria-label="Plate stack preview per side">
                  <div className="sleeve-shaft" />
                  {matchedLoad.per_stack.length === 0 ? (
                    <span className="sub-cell" style={{ padding: '0 12px' }}>
                      Empty bar / handles ({active.base_kg} kg)
                    </span>
                  ) : (
                    matchedLoad.per_stack.map((p, idx) => (
                      <div
                        key={idx}
                        className="disc-block num"
                        style={{ height: plateHeight(p) }}
                        title={`${p} kg`}
                      >
                        {p}
                      </div>
                    ))
                  )}
                  <div className="sleeve-shaft" style={{ width: 20 }} />
                </div>
              )}
            </div>
          )}

          {active && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="num" style={{ width: 110 }}>
                      Logged weight
                    </th>
                    <th className="num" style={{ width: 90 }}>
                      Step
                    </th>
                    <th>Plates per side / stack</th>
                  </tr>
                </thead>
                <tbody>
                  {active.loads.map((l, idx) => {
                    const prev = idx > 0 ? active.loads[idx - 1].total_kg : null
                    const step = prev !== null ? Math.round((l.total_kg - prev) * 10) / 10 : null
                    const isMax = idx === active.loads.length - 1
                    const isPicked = matchedLoad?.total_kg === l.total_kg
                    return (
                      <tr
                        key={l.total_kg}
                        className="clickable"
                        style={{ background: isPicked ? 'var(--raised)' : undefined }}
                        onClick={() => setTargetInput(String(l.total_kg))}
                      >
                        <td className="num" style={{ fontWeight: 600 }}>
                          {l.total_kg} kg
                        </td>
                        <td className="num" style={{ color: 'var(--faint)' }}>
                          {step !== null ? `+${step} kg` : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {l.per_stack.length === 0 ? (
                              <span className="sub-cell">Empty bar / handles</span>
                            ) : (
                              l.per_stack.map((p, i) => (
                                <span key={i} className="plate-disc num">
                                  {p} kg
                                </span>
                              ))
                            )}
                            {isMax && (
                              <span className="status-dot warn" style={{ marginLeft: 'auto' }}>
                                Ceiling
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
