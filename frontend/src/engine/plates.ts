import type { EquipmentDef, PlateItem, StoredEquipmentConfig } from './types'

export type PlateLoad = {
  total_kg: number
  per_stack: number[]
}

const g = (kg: number) => Math.round(kg * 1000)
const toKg = (grams: number) => grams / 1000

export function equipmentFor(
  cfg: StoredEquipmentConfig,
  templateId: string,
  hevyEquipment?: string | null,
): string | null {
  if (cfg.exercise_overrides[templateId]) return cfg.exercise_overrides[templateId]
  if (hevyEquipment && cfg.hevy_equipment[hevyEquipment]) return cfg.hevy_equipment[hevyEquipment]
  return null
}

export function computeLoads(cfg: StoredEquipmentConfig, eqKey: string): PlateLoad[] {
  const eq = cfg.equipment[eqKey]
  if (!eq) return []

  const sizes = cfg.plates.map((p) => ({
    grams: g(p.kg),
    maxPerStack: Math.floor(p.count / Math.max(1, eq.stacks)),
  }))

  const best = new Map<number, number[]>()
  const counts = new Array<number>(sizes.length).fill(0)

  while (true) {
    const stack: number[] = []
    for (let i = 0; i < sizes.length; i++) {
      for (let c = 0; c < counts[i]; c++) stack.push(sizes[i].grams)
    }
    const sum = stack.reduce((a, b) => a + b, 0)
    const total = g(eq.base_kg) + eq.counted * sum
    const prev = best.get(total)
    if (!prev || stack.length < prev.length) {
      best.set(total, stack)
    }

    let i = 0
    while (i < counts.length && counts[i] === sizes[i].maxPerStack) {
      counts[i] = 0
      i++
    }
    if (i === counts.length) break
    counts[i]++
  }

  return Array.from(best.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([total, stack]) => ({
      total_kg: toKg(total),
      per_stack: [...stack].sort((a, b) => b - a).map(toKg),
    }))
}

export function findLoad(cfg: StoredEquipmentConfig, eqKey: string, kgVal: number): PlateLoad | null {
  const target = g(kgVal)
  return computeLoads(cfg, eqKey).find((l) => g(l.total_kg) === target) ?? null
}

export function nextUp(cfg: StoredEquipmentConfig, eqKey: string, currentKg: number): PlateLoad | null {
  const cur = g(currentKg)
  return computeLoads(cfg, eqKey).find((l) => g(l.total_kg) > cur) ?? null
}

export function normalizeConfig(
  prev: StoredEquipmentConfig,
  plates: PlateItem[],
  equipment?: Record<string, EquipmentDef>,
): StoredEquipmentConfig {
  const merged = new Map<number, number>()
  for (const p of plates) {
    if (!Number.isFinite(p.kg) || p.kg <= 0) throw new Error('Plate weight must be > 0')
    merged.set(g(p.kg), (merged.get(g(p.kg)) ?? 0) + Math.max(0, Math.round(p.count)))
  }
  const cleanPlates: PlateItem[] = Array.from(merged.entries())
    .sort((a, b) => b[0] - a[0])
    .filter(([, c]) => c > 0)
    .map(([grams, count]) => ({ kg: toKg(grams), count }))
  if (cleanPlates.length > 12) throw new Error('At most 12 distinct plate sizes supported')

  const nextEq = equipment ?? prev.equipment
  for (const [k, eq] of Object.entries(nextEq)) {
    if (eq.stacks < 1 || eq.counted < 1) throw new Error(`${k}: stacks and counted must be >= 1`)
    if (!Number.isFinite(eq.base_kg) || eq.base_kg < 0) throw new Error(`${k}: base_kg must be >= 0`)
  }
  return { ...prev, plates: cleanPlates, equipment: nextEq }
}
