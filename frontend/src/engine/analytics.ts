import type {
  BodyOverview,
  CoachExercisePlan,
  CoachOverview,
  EquipmentConfig,
  ExerciseDetail,
  ExercisesOverview,
  ExerciseSessionPoint,
  ExerciseSummary,
  Milestone,
  MuscleDetail,
  MusclesReport,
  Overview,
  PrEvent,
  ReportsOverview,
  SplitPlan,
  WeekStats,
  WorkoutDetail,
  WorkoutSummary,
} from '../api'
import { computeLoads, equipmentFor, findLoad, nextUp, type PlateLoad } from './plates'
import type { CachedState, RawSet, RawTemplate, RawWorkout } from './types'

const MAJOR_MUSCLES = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'lats',
  'upper_back',
  'traps',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abdominals',
]

const ALL_MUSCLES = [...MAJOR_MUSCLES, 'forearms', 'adductors']

const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100

function localIsoDate(ts: string): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayLocal(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mondayOf(d: Date): Date {
  const out = new Date(d)
  const dow = (out.getDay() + 6) % 7 // Mon=0..Sun=6
  out.setDate(out.getDate() - dow)
  out.setHours(0, 0, 0, 0)
  return out
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

function durationMin(w: RawWorkout): number {
  const s = new Date(w.start_time).getTime()
  const e = new Date(w.end_time).getTime()
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? (e - s) / 60000 : 0
}

function isHard(s: RawSet): boolean {
  return s.type !== 'warmup'
}

function epley(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return round1(reps === 1 ? weightKg : weightKg * (1 + reps / 30))
}

function templateLookup(templates: RawTemplate[]): Map<string, RawTemplate> {
  return new Map(templates.map((t) => [t.id, t]))
}

function summarizeWorkout(w: RawWorkout): WorkoutSummary {
  let hard = 0
  let warmup = 0
  let vol = 0
  for (const ex of w.exercises) {
    for (const s of ex.sets) {
      if (isHard(s)) {
        hard++
        vol += (s.weight_kg ?? 0) * (s.reps ?? 0)
      } else {
        warmup++
      }
    }
  }
  return {
    id: w.id,
    title: w.title,
    date: localIsoDate(w.start_time),
    start_time: w.start_time,
    duration_min: Math.round(durationMin(w)),
    exercises: w.exercises.length,
    hard_sets: hard,
    warmup_sets: warmup,
    volume_kg: Math.round(vol),
  }
}

export function computeOverview(state: CachedState, weeks = 6): Overview {
  const today = todayLocal()
  const thisMonday = mondayOf(today)
  const tMap = templateLookup(state.templates)
  const sorted = [...state.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))

  const weekCount = Math.max(weeks, 2)
  const weekly: WeekStats[] = []
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = new Date(thisMonday)
    start.setDate(thisMonday.getDate() - i * 7)
    const startIso = toIso(start)
    const inWeek = sorted.filter((w) => toIso(mondayOf(dateFromIso(localIsoDate(w.start_time)))) === startIso)
    let hardSets = 0
    let vol = 0
    let dur = 0
    for (const w of inWeek) {
      dur += durationMin(w)
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!isHard(s)) continue
          hardSets++
          vol += (s.weight_kg ?? 0) * (s.reps ?? 0)
        }
      }
    }
    weekly.push({
      week_start: startIso,
      workouts: inWeek.length,
      duration_min: Math.round(dur),
      hard_sets: hardSets,
      volume_kg: Math.round(vol),
    })
  }

  const dayMap = new Map<string, { workouts: number; hard_sets: number }>()
  const splitMap = new Map<string, { sessions: number; last: string }>()
  for (const w of sorted) {
    const d = localIsoDate(w.start_time)
    const hard = w.exercises.reduce((a, ex) => a + ex.sets.filter(isHard).length, 0)
    const prevD = dayMap.get(d) ?? { workouts: 0, hard_sets: 0 }
    dayMap.set(d, { workouts: prevD.workouts + 1, hard_sets: prevD.hard_sets + hard })

    const prevS = splitMap.get(w.title) ?? { sessions: 0, last: d }
    splitMap.set(w.title, { sessions: prevS.sessions + 1, last: d > prevS.last ? d : prevS.last })
  }

  const splits = Array.from(splitMap.entries())
    .map(([title, v]) => ({
      title,
      sessions: v.sessions,
      last_date: v.last,
      days_ago: diffDays(today, dateFromIso(v.last)),
    }))
    .sort((a, b) => b.days_ago - a.days_ago)

  const cutoff7 = new Date(today)
  cutoff7.setDate(today.getDate() - 6)
  const cutoffIso = toIso(cutoff7)

  const musclesMap = new Map<string, number>(MAJOR_MUSCLES.map((m) => [m, 0]))
  for (const w of sorted) {
    if (localIsoDate(w.start_time) < cutoffIso) continue
    for (const ex of w.exercises) {
      const tpl = tMap.get(ex.exercise_template_id)
      const hardCount = ex.sets.filter(isHard).length
      if (!tpl || hardCount === 0) continue
      musclesMap.set(tpl.primary_muscle_group, (musclesMap.get(tpl.primary_muscle_group) ?? 0) + hardCount)
      for (const sec of tpl.secondary_muscle_groups ?? []) {
        musclesMap.set(sec, (musclesMap.get(sec) ?? 0) + hardCount * 0.5)
      }
    }
  }

  const getM = (k: string) => musclesMap.get(k) ?? 0
  const balance_7d = {
    push_sets: round1(getM('chest') + getM('shoulders') + getM('triceps')),
    pull_sets: round1(getM('lats') + getM('upper_back') + getM('traps') + getM('biceps')),
    upper_sets: round1(
      getM('chest') +
        getM('shoulders') +
        getM('triceps') +
        getM('biceps') +
        getM('lats') +
        getM('upper_back') +
        getM('traps'),
    ),
    lower_sets: round1(getM('quadriceps') + getM('hamstrings') + getM('glutes') + getM('calves')),
  }

  const muscles_7d = Array.from(musclesMap.entries())
    .map(([muscle, sets]) => ({ muscle, sets: round1(sets) }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle))

  const byWeek = new Map<string, number>()
  for (const w of sorted) {
    const wk = toIso(mondayOf(dateFromIso(localIsoDate(w.start_time))))
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1)
  }
  const cursor = new Date(thisMonday)
  if ((byWeek.get(toIso(cursor)) ?? 0) < 2) cursor.setDate(cursor.getDate() - 7)
  let streak_weeks = 0
  while ((byWeek.get(toIso(cursor)) ?? 0) >= 2) {
    streak_weeks++
    cursor.setDate(cursor.getDate() - 7)
  }

  let totalHard = 0
  let totalDur = 0
  let totalVol = 0
  for (const w of sorted) {
    totalDur += durationMin(w)
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!isHard(s)) continue
        totalHard++
        totalVol += (s.weight_kg ?? 0) * (s.reps ?? 0)
      }
    }
  }

  return {
    this_week: weekly[weekly.length - 1],
    last_week: weekly[weekly.length - 2],
    totals: {
      workouts: sorted.length,
      hard_sets: totalHard,
      duration_min: Math.round(totalDur),
      volume_kg: Math.round(totalVol),
      streak_weeks,
    },
    weekly,
    days: Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v })),
    splits,
    muscles_7d,
    balance_7d,
    recent_workouts: sorted.slice(-5).reverse().map(summarizeWorkout),
    bodyweight: [...state.measurements]
      .filter((m) => m.weight_kg != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => [m.date, Number(m.weight_kg)] as [string, number]),
  }
}

export function computeWorkouts(state: CachedState): WorkoutSummary[] {
  return [...state.workouts]
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .map(summarizeWorkout)
}

export function computeWorkoutDetail(state: CachedState, id: string): WorkoutDetail {
  const w = state.workouts.find((x) => x.id === id)
  if (!w) throw new Error(`Workout ${id} not found`)
  const tMap = templateLookup(state.templates)
  const cfg = state.equipment
  return {
    id: w.id,
    title: w.title,
    start_time: w.start_time,
    end_time: w.end_time,
    exercises: w.exercises.map((e) => {
      const tpl = tMap.get(e.exercise_template_id)
      const eqKey = equipmentFor(cfg, e.exercise_template_id, tpl?.equipment)
      const weights = e.sets
        .filter(isHard)
        .map((s) => s.weight_kg)
        .filter((v): v is number => v !== null)
      const top = weights.length > 0 ? Math.max(...weights) : null
      return {
        index: e.index,
        title: e.title,
        template_id: e.exercise_template_id,
        primary_muscle: tpl?.primary_muscle_group ?? null,
        secondary_muscles: tpl?.secondary_muscle_groups ?? [],
        equipment_key: eqKey,
        sets: e.sets,
        plate_hint: eqKey && top !== null ? findLoad(cfg, eqKey, top) : null,
        next_weight: eqKey && top !== null ? nextUp(cfg, eqKey, top) : null,
      }
    }),
  }
}

type AnalyzedEx = {
  summary: ExerciseSummary
  best_set_volume: number | null
  plate_hint: PlateLoad | null
  next_weight: PlateLoad | null
  history: ExerciseSessionPoint[]
  prs: PrEvent[]
}

function analyzeExercises(state: CachedState): {
  list: AnalyzedEx[]
  prFeed: PrEvent[]
} {
  const today = todayLocal()
  const tMap = templateLookup(state.templates)
  const cfg = state.equipment
  const sorted = [...state.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))

  const byTpl = new Map<string, { w: RawWorkout; exTitle: string; sets: RawSet[] }[]>()
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const arr = byTpl.get(ex.exercise_template_id) ?? []
      arr.push({ w, exTitle: ex.title, sets: ex.sets })
      byTpl.set(ex.exercise_template_id, arr)
    }
  }

  const out: AnalyzedEx[] = []
  const allPrs: PrEvent[] = []

  for (const [tplId, entries] of byTpl.entries()) {
    const tpl = tMap.get(tplId)
    const title = tpl?.title ?? entries[0].exTitle
    const primary_muscle = tpl?.primary_muscle_group ?? null
    const secondary_muscles = tpl?.secondary_muscle_groups ?? []
    const equipment_key = equipmentFor(cfg, tplId, tpl?.equipment)

    let bestE1rm: number | null = null
    let bestWeight: number | null = null
    let bestReps: number | null = null
    let bestSetVol: number | null = null
    const repsAtWeight = new Map<number, number>()
    let lastPrIdx = 0
    let totalHardSets = 0
    const history: ExerciseSessionPoint[] = []

    entries.forEach((entry, idx) => {
      const date = localIsoDate(entry.w.start_time)
      let hard = 0
      let warmup = 0
      let vol = 0
      let sTopW: number | null = null
      let sTopR: number | null = null
      let sBestE1rm: number | null = null
      let sBestVol: number | null = null
      const sRepsByW = new Map<number, number>()
      const setItems: ExerciseSessionPoint['sets'] = []

      for (const s of entry.sets) {
        const hardFlag = isHard(s)
        const w = s.weight_kg ?? 0
        const r = s.reps ?? 0
        const sE1rm = hardFlag && w > 0 && r > 0 ? epley(w, r) : null
        setItems.push({ set_type: s.type, weight_kg: s.weight_kg, reps: s.reps, e1rm: sE1rm })

        if (!hardFlag) {
          warmup++
          continue
        }
        hard++
        totalHardSets++
        if (w > 0 && r > 0) {
          const sv = w * r
          vol += sv
          sBestVol = sBestVol === null ? sv : Math.max(sBestVol, sv)
          const g = Math.round(w * 1000)
          sRepsByW.set(g, Math.max(sRepsByW.get(g) ?? 0, r))
        }
        if (s.weight_kg !== null) sTopW = sTopW === null ? s.weight_kg : Math.max(sTopW, s.weight_kg)
        if (s.reps !== null) sTopR = sTopR === null ? s.reps : Math.max(sTopR, s.reps)
        if (sE1rm !== null) sBestE1rm = sBestE1rm === null ? sE1rm : Math.max(sBestE1rm, sE1rm)
      }

      const sessionPrs: string[] = []
      if (idx > 0) {
        if (bestE1rm !== null && sBestE1rm !== null && sBestE1rm > bestE1rm) {
          const d = round1(sBestE1rm - bestE1rm)
          sessionPrs.push('e1RM PR')
          allPrs.push({
            date,
            workout_id: entry.w.id,
            workout_title: entry.w.title,
            template_id: tplId,
            exercise_title: title,
            kind: 'e1RM',
            value_label: `${sBestE1rm.toFixed(1)} kg`,
            delta_label: `+${d.toFixed(1)} kg`,
          })
        }
        if (bestWeight !== null && sTopW !== null && sTopW > bestWeight) {
          const d = round1(sTopW - bestWeight)
          sessionPrs.push('Weight PR')
          allPrs.push({
            date,
            workout_id: entry.w.id,
            workout_title: entry.w.title,
            template_id: tplId,
            exercise_title: title,
            kind: 'Weight',
            value_label: `${sTopW} kg`,
            delta_label: `+${d} kg`,
          })
        }
        for (const [grams, curReps] of sRepsByW.entries()) {
          const prevReps = repsAtWeight.get(grams)
          if (prevReps !== undefined && curReps > prevReps) {
            const wKg = grams / 1000
            sessionPrs.push(`Rep PR @ ${wKg} kg`)
            allPrs.push({
              date,
              workout_id: entry.w.id,
              workout_title: entry.w.title,
              template_id: tplId,
              exercise_title: title,
              kind: 'Rep PR',
              value_label: `${curReps} reps @ ${wKg} kg`,
              delta_label: `+${curReps - prevReps} reps`,
            })
          }
        }
        if (
          bestSetVol !== null &&
          sBestVol !== null &&
          sBestVol > bestSetVol &&
          !sessionPrs.some((p) => p.startsWith('e1RM') || p.startsWith('Rep PR'))
        ) {
          sessionPrs.push('Set Volume PR')
          allPrs.push({
            date,
            workout_id: entry.w.id,
            workout_title: entry.w.title,
            template_id: tplId,
            exercise_title: title,
            kind: 'Set Volume',
            value_label: `${Math.round(sBestVol)} kg`,
            delta_label: `+${Math.round(sBestVol - bestSetVol)} kg`,
          })
        }
      }

      if (idx === 0 || sessionPrs.length > 0) lastPrIdx = idx
      if (sBestE1rm !== null) bestE1rm = bestE1rm === null ? sBestE1rm : Math.max(bestE1rm, sBestE1rm)
      if (sTopW !== null) bestWeight = bestWeight === null ? sTopW : Math.max(bestWeight, sTopW)
      if (sTopR !== null) bestReps = bestReps === null ? sTopR : Math.max(bestReps, sTopR)
      if (sBestVol !== null) bestSetVol = bestSetVol === null ? sBestVol : Math.max(bestSetVol, sBestVol)
      for (const [g, r] of sRepsByW.entries()) repsAtWeight.set(g, Math.max(repsAtWeight.get(g) ?? 0, r))

      history.push({
        workout_id: entry.w.id,
        workout_title: entry.w.title,
        date,
        hard_sets: hard,
        warmup_sets: warmup,
        volume_kg: Math.round(vol),
        top_weight_kg: sTopW,
        top_reps: sTopR,
        best_e1rm: sBestE1rm,
        prs: sessionPrs,
        sets: setItems,
      })
    })

    const sessions = history.length
    const last = history[sessions - 1]
    const first = history[0]
    const days_ago = diffDays(today, dateFromIso(last.date))
    const sessions_since_pr = Math.max(0, sessions - 1 - lastPrIdx)
    const status: ExerciseSummary['status'] =
      last.prs.length > 0 ? 'pr' : sessions >= 3 && sessions_since_pr >= 2 ? 'plateau' : 'building'
    const e1rm_delta =
      sessions >= 2 && first.best_e1rm !== null && last.best_e1rm !== null
        ? round1(last.best_e1rm - first.best_e1rm)
        : null

    const plate_hint =
      equipment_key && last.top_weight_kg !== null ? findLoad(cfg, equipment_key, last.top_weight_kg) : null
    const next_weight =
      equipment_key && last.top_weight_kg !== null ? nextUp(cfg, equipment_key, last.top_weight_kg) : null
    const at_ceiling = equipment_key !== null && last.top_weight_kg !== null && next_weight === null

    out.push({
      summary: {
        template_id: tplId,
        title,
        primary_muscle,
        secondary_muscles,
        equipment_key,
        sessions,
        total_hard_sets: totalHardSets,
        last_date: last.date,
        days_ago,
        best_e1rm: bestE1rm,
        best_weight_kg: bestWeight,
        best_reps: bestReps,
        latest_e1rm: last.best_e1rm,
        latest_weight_kg: last.top_weight_kg,
        latest_top_reps: last.top_reps,
        e1rm_delta,
        sessions_since_pr,
        status,
        at_ceiling,
        next_weight_kg: next_weight?.total_kg ?? null,
      },
      best_set_volume: bestSetVol !== null ? Math.round(bestSetVol) : null,
      plate_hint,
      next_weight,
      history,
      prs: [],
    })
  }

  out.sort(
    (a, b) =>
      b.summary.sessions - a.summary.sessions ||
      b.summary.last_date.localeCompare(a.summary.last_date) ||
      a.summary.title.localeCompare(b.summary.title),
  )
  allPrs.sort((a, b) => b.date.localeCompare(a.date) || a.exercise_title.localeCompare(b.exercise_title))
  return { list: out, prFeed: allPrs.slice(0, 30) }
}

export function computeExercises(state: CachedState): ExercisesOverview {
  const { list, prFeed } = analyzeExercises(state)
  return { exercises: list.map((x) => x.summary), pr_feed: prFeed }
}

export function computeExerciseDetail(state: CachedState, id: string): ExerciseDetail {
  const item = analyzeExercises(state).list.find((x) => x.summary.template_id === id)
  if (!item) throw new Error(`Exercise ${id} not found`)
  return {
    template_id: item.summary.template_id,
    title: item.summary.title,
    primary_muscle: item.summary.primary_muscle,
    secondary_muscles: item.summary.secondary_muscles,
    equipment_key: item.summary.equipment_key,
    sessions: item.summary.sessions,
    total_hard_sets: item.summary.total_hard_sets,
    best_e1rm: item.summary.best_e1rm,
    best_weight_kg: item.summary.best_weight_kg,
    best_reps: item.summary.best_reps,
    best_set_volume: item.best_set_volume,
    sessions_since_pr: item.summary.sessions_since_pr,
    status: item.summary.status,
    plate_hint: item.plate_hint,
    next_weight: item.next_weight,
    at_ceiling: item.summary.at_ceiling,
    history: item.history,
  }
}

export function computeMuscles(state: CachedState, days = 7): MusclesReport {
  const safeDays = Math.min(90, Math.max(1, days))
  const today = todayLocal()
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - (safeDays - 1))
  const cutoffIso = toIso(cutoff)
  const nowMs = Date.now()
  const tMap = templateLookup(state.templates)

  const counts = new Map<string, number>(ALL_MUSCLES.map((m) => [m, 0]))
  const lastHit = new Map<string, number>()
  const contribs = new Map<string, Map<string, { title: string; sets: number; role: 'primary' | 'secondary' }>>()

  for (const w of state.workouts) {
    const dtMs = new Date(w.start_time).getTime()
    const dIso = localIsoDate(w.start_time)
    for (const ex of w.exercises) {
      const hard = ex.sets.filter(isHard).length
      if (hard === 0) continue
      const tpl = tMap.get(ex.exercise_template_id)
      if (!tpl) continue

      const addHit = (muscle: string, weight: number, role: 'primary' | 'secondary') => {
        lastHit.set(muscle, Math.max(lastHit.get(muscle) ?? 0, dtMs))
        if (dIso >= cutoffIso) {
          counts.set(muscle, (counts.get(muscle) ?? 0) + hard * weight)
          const mMap = contribs.get(muscle) ?? new Map()
          const prev = mMap.get(ex.exercise_template_id) ?? { title: ex.title, sets: 0, role }
          prev.sets += hard * weight
          mMap.set(ex.exercise_template_id, prev)
          contribs.set(muscle, mMap)
        }
      }

      addHit(tpl.primary_muscle_group, 1, 'primary')
      for (const sec of tpl.secondary_muscle_groups ?? []) addHit(sec, 0.5, 'secondary')
    }
  }

  const getM = (k: string) => counts.get(k) ?? 0
  const muscles: MuscleDetail[] = Array.from(counts.entries())
    .map(([muscle, sets]) => {
      const lastMs = lastHit.get(muscle)
      const hours_since = lastMs !== undefined ? Math.max(0, Math.floor((nowMs - lastMs) / 3_600_000)) : null
      const freshness =
        hours_since === null
          ? 'Untrained'
          : hours_since < 24
            ? 'Fatigued (<24h)'
            : hours_since < 48
              ? 'Recovering (24–48h)'
              : 'Ready (≥48h)'
      const exercises = Array.from(contribs.get(muscle)?.entries() ?? [])
        .map(([template_id, v]) => ({ template_id, title: v.title, sets: round1(v.sets), role: v.role }))
        .sort((a, b) => b.sets - a.sets || a.title.localeCompare(b.title))
      return {
        muscle,
        sets: round1(sets),
        weekly_rate: round1((sets * 7) / safeDays),
        last_date: lastMs !== undefined ? localIsoDate(new Date(lastMs).toISOString()) : null,
        hours_since,
        freshness,
        exercises,
      }
    })
    .sort((a, b) => b.weekly_rate - a.weekly_rate || a.muscle.localeCompare(b.muscle))

  return {
    days: safeDays,
    muscles,
    push_sets: round1(getM('chest') + getM('shoulders') + getM('triceps')),
    pull_sets: round1(getM('lats') + getM('upper_back') + getM('traps') + getM('biceps')),
    upper_sets: round1(
      getM('chest') +
        getM('shoulders') +
        getM('triceps') +
        getM('biceps') +
        getM('lats') +
        getM('upper_back') +
        getM('traps'),
    ),
    lower_sets: round1(getM('quadriceps') + getM('hamstrings') + getM('glutes') + getM('calves')),
  }
}

export function computeBody(state: CachedState): BodyOverview {
  const sorted = [...state.measurements].sort((a, b) => b.date.localeCompare(a.date))
  const weights = sorted.map((m) => m.weight_kg).filter((v): v is number => v != null)
  const latest_weight_kg = weights[0] ?? null
  const weight_delta_kg = weights.length >= 2 ? round1(weights[0] - weights[1]) : null
  const { exercises } = computeExercises(state)
  const relative_strength =
    latest_weight_kg && latest_weight_kg > 0
      ? exercises
          .filter((ex) => ex.best_e1rm !== null)
          .map((ex) => ({
            template_id: ex.template_id,
            title: ex.title,
            primary_muscle: ex.primary_muscle,
            best_e1rm: Number(ex.best_e1rm),
            ratio: round2(Number(ex.best_e1rm) / latest_weight_kg),
            latest_weight_kg: ex.latest_weight_kg,
            latest_top_reps: ex.latest_top_reps,
          }))
          .sort((a, b) => b.ratio - a.ratio)
          .slice(0, 10)
      : []

  return {
    latest_weight_kg,
    weight_delta_kg,
    latest_date: sorted[0]?.date ?? null,
    measurements: sorted,
    relative_strength,
  }
}

function splitMuscles(split: string): string[] {
  switch (split.toLowerCase()) {
    case 'push':
      return ['chest', 'shoulders', 'triceps']
    case 'pull':
      return ['lats', 'upper_back', 'traps', 'biceps', 'forearms']
    case 'legs':
    case 'lower':
      return ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors']
    case 'upper':
      return ['chest', 'shoulders', 'triceps', 'lats', 'upper_back', 'biceps']
    default:
      return []
  }
}

const SUGGESTIONS: Record<string, string> = {
  lats: 'Lat Pulldown (Cable) or One-Arm Dumbbell Row (+3 sets)',
  upper_back: 'Bent Over Row (Dumbbell) or Rear Delt Fly (+3 sets)',
  traps: 'Shrug (Dumbbell) or Barbell Shrug (+3 sets)',
  biceps: 'Preacher Curl (Barbell) or Hammer Curl (+3 sets)',
  chest: 'Incline Bench Press (Dumbbell) (+3 sets)',
  shoulders: 'Lateral Raise (Dumbbell) (+3 sets)',
  triceps: 'Skullcrusher (Barbell) or Triceps Extension (+3 sets)',
  quadriceps: 'Goblet Squat or Split Squat (Dumbbell) (+3 sets)',
  hamstrings: 'Romanian Deadlift (Dumbbell or Barbell) (+3 sets)',
  glutes: 'Romanian Deadlift or Glute Bridge (+3 sets)',
  calves: 'Standing Calf Raise (Dumbbell) (+3 sets)',
}

const fmtPlates = (load: PlateLoad) =>
  load.per_stack.length === 0 ? 'empty bar' : `${load.per_stack.join(' + ')} kg/side`

export function computeCoach(state: CachedState): CoachOverview {
  const today = todayLocal()
  const tMap = templateLookup(state.templates)
  const cfg = state.equipment
  const muscleRep = computeMuscles(state, 7)
  const rates = new Map(muscleRep.muscles.map((m) => [m.muscle, m.weekly_rate]))
  const sorted = [...state.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))

  const latestByEx = new Map<string, { w: RawWorkout; sets: RawSet[]; title: string }>()
  const latestBySplit = new Map<string, RawWorkout>()
  for (const w of sorted) {
    latestBySplit.set(w.title, w)
    for (const ex of w.exercises) {
      latestByEx.set(ex.exercise_template_id, { w, sets: ex.sets, title: ex.title })
    }
  }

  const splits: SplitPlan[] = Array.from(latestBySplit.entries())
    .map(([split, w]) => {
      const lastDate = localIsoDate(w.start_time)
      const days_ago = diffDays(today, dateFromIso(lastDate))
      const exercises: CoachExercisePlan[] = w.exercises.map((ex) => {
        const latest = latestByEx.get(ex.exercise_template_id)
        const rows = latest?.sets ?? ex.sets
        const lastW = latest?.w ?? w
        const tpl = tMap.get(ex.exercise_template_id)
        const eqKey = equipmentFor(cfg, ex.exercise_template_id, tpl?.equipment)
        const working = rows.filter(isHard)
        const working_sets = Math.max(1, working.length)
        const last_summary =
          working.length === 0
            ? 'No working sets'
            : working
                .map((r) => (r.weight_kg && r.weight_kg > 0 ? `${r.weight_kg}×${r.reps ?? 0}` : `BW×${r.reps ?? 0}`))
                .join(', ')
        const wVals = working.map((r) => r.weight_kg).filter((v): v is number => v !== null)
        const topW = wVals.length > 0 ? Math.max(...wVals) : null
        const rVals = working.map((r) => r.reps).filter((v): v is number => v !== null)
        const minR = rVals.length > 0 ? Math.min(...rVals) : 8
        const maxR = rVals.length > 0 ? Math.max(...rVals) : minR

        if (topW !== null && topW > 0) {
          const curLoad = eqKey ? findLoad(cfg, eqKey, topW) : null
          const next = eqKey ? nextUp(cfg, eqKey, topW) : null
          const atCeiling = eqKey !== null && next === null
          const ready = minR >= 12 || (minR >= 10 && maxR >= 15)
          if (ready) {
            if (next) {
              const span = minR === maxR ? `${minR}` : `${minR}–${maxR}`
              return {
                template_id: ex.exercise_template_id,
                title: tpl?.title ?? ex.title,
                primary_muscle: tpl?.primary_muscle_group ?? null,
                equipment_key: eqKey,
                action: 'increase_weight',
                reason: `Hit ${span} reps @ ${topW} kg. Load ${next.total_kg} kg (${fmtPlates(next)}) and rebuild from 8 reps.`,
                last_date: localIsoDate(lastW.start_time),
                last_summary,
                target_weight_kg: next.total_kg,
                target_reps: 8,
                working_sets,
                plate_load: next,
                next_load: next,
                at_ceiling: false,
                rest_seconds: 120,
              }
            }
            const targetReps = Math.min(20, maxR + 2)
            return {
              template_id: ex.exercise_template_id,
              title: tpl?.title ?? ex.title,
              primary_muscle: tpl?.primary_muscle_group ?? null,
              equipment_key: eqKey,
              action: 'ceiling_switch',
              reason: `At ${topW} kg plate ceiling. Push to ${targetReps} reps with 3-1-1 tempo, or switch to a one-arm variant (unlocks up to 24 kg).`,
              last_date: localIsoDate(lastW.start_time),
              last_summary,
              target_weight_kg: topW,
              target_reps: targetReps,
              working_sets,
              plate_load: curLoad,
              next_load: null,
              at_ceiling: true,
              rest_seconds: 90,
            }
          }
          const targetReps = Math.min(15, Math.max(8, minR + 1))
          return {
            template_id: ex.exercise_template_id,
            title: tpl?.title ?? ex.title,
            primary_muscle: tpl?.primary_muscle_group ?? null,
            equipment_key: eqKey,
            action: 'add_reps',
            reason: `Hold ${topW} kg (${curLoad ? fmtPlates(curLoad) : `${topW} kg`}). Aim for ${targetReps}+ reps across all ${working_sets} sets before adding weight.`,
            last_date: localIsoDate(lastW.start_time),
            last_summary,
            target_weight_kg: topW,
            target_reps: targetReps,
            working_sets,
            plate_load: curLoad,
            next_load: next,
            at_ceiling: atCeiling,
            rest_seconds: 90,
          }
        }

        const bwReps = Math.min(25, minR + 2)
        return {
          template_id: ex.exercise_template_id,
          title: tpl?.title ?? ex.title,
          primary_muscle: tpl?.primary_muscle_group ?? null,
          equipment_key: eqKey,
          action: 'bodyweight_reps',
          reason: `Bodyweight: aim for ${bwReps} controlled reps per set.`,
          last_date: localIsoDate(lastW.start_time),
          last_summary,
          target_weight_kg: null,
          target_reps: bwReps,
          working_sets,
          plate_load: null,
          next_load: null,
          at_ceiling: false,
          rest_seconds: 90,
        }
      })

      const muscle_gaps = splitMuscles(split)
        .filter((m) => (rates.get(m) ?? 0) < 10)
        .map((m) => ({
          muscle: m,
          weekly_rate: rates.get(m) ?? 0,
          suggestion: SUGGESTIONS[m] ?? 'Add 2–3 working sets for this muscle',
        }))
        .sort((a, b) => a.weekly_rate - b.weekly_rate)

      const stepUps = exercises.filter((e) => e.action === 'increase_weight').length
      return {
        split,
        days_ago,
        last_date: lastDate,
        routine_title: `Coach: ${split}`,
        notes: `Generated by Hevy Ledger (plate-aware coach). ${stepUps} load step-up(s) prescribed.`,
        exercises,
        muscle_gaps,
      }
    })
    .sort((a, b) => b.days_ago - a.days_ago || a.split.localeCompare(b.split))

  return { recommended_split: splits[0]?.split ?? null, splits }
}

export function computeReports(state: CachedState, period: '30d' | 'all'): ReportsOverview {
  const today = todayLocal()
  const cutoff = new Date(today)
  cutoff.setDate(today.getDate() - 29)
  const cutoffIso = toIso(cutoff)
  const tMap = templateLookup(state.templates)

  const filtered =
    period === '30d'
      ? state.workouts.filter((w) => localIsoDate(w.start_time) >= cutoffIso)
      : state.workouts

  const hourSets = new Map<number, number>()
  const wdSets = new Map<string, number>()
  const exCounts = new Map<string, number>()
  const mCounts = new Map<string, number>()
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  let hardSets = 0
  let totalMin = 0
  let totalVol = 0

  for (const w of filtered) {
    totalMin += durationMin(w)
    const dt = new Date(w.start_time)
    hourSets.set(dt.getHours(), (hourSets.get(dt.getHours()) ?? 0) + 1)
    const wd = weekdays[dt.getDay()]
    wdSets.set(wd, (wdSets.get(wd) ?? 0) + 1)
    for (const ex of w.exercises) {
      const tpl = tMap.get(ex.exercise_template_id)
      for (const s of ex.sets) {
        if (!isHard(s)) continue
        hardSets++
        totalVol += (s.weight_kg ?? 0) * (s.reps ?? 0)
        exCounts.set(ex.title, (exCounts.get(ex.title) ?? 0) + 1)
        if (tpl) {
          mCounts.set(tpl.primary_muscle_group, (mCounts.get(tpl.primary_muscle_group) ?? 0) + 1)
          for (const sec of tpl.secondary_muscle_groups ?? []) {
            mCounts.set(sec, (mCounts.get(sec) ?? 0) + 0.5)
          }
        }
      }
    }
  }

  const topEntry = <T>(m: Map<T, number>): [T, number] | null => {
    let best: [T, number] | null = null
    for (const e of m.entries()) if (!best || e[1] > best[1]) best = e
    return best
  }

  const topHour = topEntry(hourSets)
  const topWd = topEntry(wdSets)
  const favEx = topEntry(exCounts)
  const favM = topEntry(mCounts)
  const ov = computeOverview(state, 12)
  const { prFeed } = analyzeExercises({ ...state, workouts: filtered })
  const biggestPr = prFeed[0]
    ? `${prFeed[0].exercise_title} — ${prFeed[0].value_label} (${prFeed[0].delta_label})`
    : null

  const mkM = (id: string, title: string, cur: number, target: number, unit: string): Milestone => ({
    id,
    title,
    current: round1(cur),
    target,
    unit,
    achieved: cur >= target,
    pct: Math.round(Math.min(1, Math.max(0, cur / target)) * 100),
  })
  const tons = ov.totals.volume_kg / 1000
  const milestones: Milestone[] = [
    mkM('w10', 'First 10 workouts', ov.totals.workouts, 10, 'workouts'),
    mkM('w25', '25 workouts', ov.totals.workouts, 25, 'workouts'),
    mkM('w50', '50 workouts', ov.totals.workouts, 50, 'workouts'),
    mkM('t10', '10 metric tons lifted', tons, 10, 'tons'),
    mkM('t25', '25 metric tons lifted', tons, 25, 'tons'),
    mkM('s100', '100 hard sets', ov.totals.hard_sets, 100, 'sets'),
    mkM('s500', '500 hard sets', ov.totals.hard_sets, 500, 'sets'),
    mkM('str4', '4-week consistency streak', ov.totals.streak_weeks, 4, 'weeks'),
  ]

  const mRep = computeMuscles(state, 7)
  const coachOv = computeCoach(state)
  const under = mRep.muscles
    .filter((m) => m.weekly_rate < 10)
    .slice(0, 4)
    .map((m) => `${m.muscle.replace(/_/g, ' ')} (${m.weekly_rate.toFixed(1)}/20)`)
  const prLines = prFeed
    .slice(0, 3)
    .map((p) => `- ${p.exercise_title} (${p.date}): ${p.value_label} (${p.delta_label})`)

  const markdown_digest =
    `# Hevy Weekly Digest (${toIso(today)})\n\n` +
    `- **This week:** ${ov.this_week.workouts} workouts · ${ov.this_week.hard_sets} hard sets · ${ov.this_week.duration_min} min · ${ov.this_week.volume_kg} kg volume\n` +
    `- **Streak:** ${ov.totals.streak_weeks} consecutive weeks (≥2 sessions/wk)\n` +
    `- **7d Push : Pull:** ${mRep.push_sets.toFixed(1)} : ${mRep.pull_sets.toFixed(1)} sets\n` +
    `- **Train next:** ${coachOv.recommended_split ?? '—'}\n` +
    `- **Muscles under 10 sets/wk:** ${under.length ? under.join(', ') : 'None'}\n\n` +
    `## Recent PRs\n${prLines.length ? prLines.join('\n') : '- No PRs in this range yet'}`

  const roundedVol = Math.round(totalVol)
  const roundedMin = Math.round(totalMin)
  return {
    wrapped: {
      period: period === '30d' ? 'Last 30 days' : 'All time',
      workouts: filtered.length,
      hard_sets: hardSets,
      total_minutes: roundedMin,
      avg_minutes: filtered.length ? Math.round(roundedMin / filtered.length) : 0,
      total_volume_kg: roundedVol,
      car_equivalents: round1(roundedVol / 1300),
      favorite_exercise: favEx,
      favorite_muscle: favM ? [favM[0].replace(/_/g, ' '), round1(favM[1])] : null,
      peak_hour: topHour
        ? `${String(topHour[0]).padStart(2, '0')}:00–${String((topHour[0] + 1) % 24).padStart(2, '0')}:00`
        : null,
      peak_weekday: topWd ? topWd[0] : null,
      biggest_pr: biggestPr,
    },
    milestones,
    markdown_digest,
  }
}

export function computeEquipment(state: CachedState): EquipmentConfig {
  const eq: EquipmentConfig['equipment'] = {}
  for (const [k, v] of Object.entries(state.equipment.equipment)) {
    eq[k] = { ...v, loads: computeLoads(state.equipment, k) }
  }
  return {
    plates: state.equipment.plates,
    equipment: eq,
    hevy_equipment: state.equipment.hevy_equipment,
  }
}

export function buildCsvExport(state: CachedState): string {
  const tMap = templateLookup(state.templates)
  const esc = (s: string) => (/[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [
    'workout_id,date,workout_title,exercise_title,primary_muscle,set_type,weight_kg,reps,e1rm_kg',
  ]
  const sorted = [...state.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))
  for (const w of sorted) {
    const date = localIsoDate(w.start_time)
    for (const ex of w.exercises) {
      const pm = tMap.get(ex.exercise_template_id)?.primary_muscle_group ?? ''
      for (const s of ex.sets) {
        const e1rm =
          isHard(s) && s.weight_kg && s.weight_kg > 0 && s.reps && s.reps > 0
            ? epley(s.weight_kg, s.reps).toFixed(1)
            : ''
        lines.push(
          [
            esc(w.id),
            esc(date),
            esc(w.title),
            esc(ex.title),
            esc(pm),
            esc(s.type),
            s.weight_kg ?? '',
            s.reps ?? '',
            e1rm,
          ].join(','),
        )
      }
    }
  }
  return `${lines.join('\n')}\n`
}
