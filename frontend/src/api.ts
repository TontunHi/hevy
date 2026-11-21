// Mirrors backend/src/metrics.rs and backend/src/main.rs

export type WeekStats = {
  week_start: string
  workouts: number
  duration_min: number
  hard_sets: number
  volume_kg: number
}

export type WorkoutSummary = {
  id: string
  title: string
  date: string
  start_time: string
  duration_min: number
  exercises: number
  hard_sets: number
  warmup_sets: number
  volume_kg: number
}

export type Overview = {
  this_week: WeekStats
  last_week: WeekStats
  totals: {
    workouts: number
    hard_sets: number
    duration_min: number
    volume_kg: number
    streak_weeks: number
  }
  weekly: WeekStats[]
  days: { date: string; workouts: number; hard_sets: number }[]
  splits: { title: string; sessions: number; last_date: string; days_ago: number }[]
  muscles_7d: { muscle: string; sets: number }[]
  balance_7d: {
    push_sets: number
    pull_sets: number
    upper_sets: number
    lower_sets: number
  }
  recent_workouts: WorkoutSummary[]
  bodyweight: [string, number][]
}

export type Status = {
  user: { name: string; username: string; is_pro?: boolean; weight_unit?: string } | null
  last_sync: string | null
  workouts: number
}

export type PlateLoad = {
  total_kg: number
  per_stack: number[]
}

export type PlateItem = {
  kg: number
  count: number
}

export type EquipmentEntry = {
  label: string
  stacks: number
  counted: number
  base_kg: number
  loads: PlateLoad[]
}

export type EquipmentConfig = {
  plates: PlateItem[]
  equipment: Record<string, EquipmentEntry>
  hevy_equipment: Record<string, string>
}

export type EquipmentMap = Record<string, EquipmentEntry>

export type WorkoutSet = {
  index: number
  type: string
  weight_kg: number | null
  reps: number | null
  distance_meters: number | null
  duration_seconds: number | null
  rpe: number | null
}

export type WorkoutDetailExercise = {
  index: number
  title: string
  template_id: string
  primary_muscle: string | null
  secondary_muscles: string[]
  equipment_key: string | null
  sets: WorkoutSet[]
  plate_hint: PlateLoad | null
  next_weight: PlateLoad | null
}

export type WorkoutDetail = {
  id: string
  title: string
  start_time: string
  end_time: string
  exercises: WorkoutDetailExercise[]
}

export type PrEvent = {
  date: string
  workout_id: string
  workout_title: string
  template_id: string
  exercise_title: string
  kind: string
  value_label: string
  delta_label: string
}

export type ExerciseSummary = {
  template_id: string
  title: string
  primary_muscle: string | null
  secondary_muscles: string[]
  equipment_key: string | null
  sessions: number
  total_hard_sets: number
  last_date: string
  days_ago: number
  best_e1rm: number | null
  best_weight_kg: number | null
  best_reps: number | null
  latest_e1rm: number | null
  latest_weight_kg: number | null
  latest_top_reps: number | null
  e1rm_delta: number | null
  sessions_since_pr: number
  status: 'pr' | 'plateau' | 'building'
  at_ceiling: boolean
  next_weight_kg: number | null
}

export type ExercisesOverview = {
  exercises: ExerciseSummary[]
  pr_feed: PrEvent[]
}

export type ExerciseSessionPoint = {
  workout_id: string
  workout_title: string
  date: string
  hard_sets: number
  warmup_sets: number
  volume_kg: number
  top_weight_kg: number | null
  top_reps: number | null
  best_e1rm: number | null
  prs: string[]
  sets: { set_type: string; weight_kg: number | null; reps: number | null; e1rm: number | null }[]
}

export type ExerciseDetail = {
  template_id: string
  title: string
  primary_muscle: string | null
  secondary_muscles: string[]
  equipment_key: string | null
  sessions: number
  total_hard_sets: number
  best_e1rm: number | null
  best_weight_kg: number | null
  best_reps: number | null
  best_set_volume: number | null
  sessions_since_pr: number
  status: 'pr' | 'plateau' | 'building'
  plate_hint: PlateLoad | null
  next_weight: PlateLoad | null
  at_ceiling: boolean
  history: ExerciseSessionPoint[]
}

export type MuscleExerciseContrib = {
  template_id: string
  title: string
  sets: number
  role: 'primary' | 'secondary'
}

export type MuscleDetail = {
  muscle: string
  sets: number
  weekly_rate: number
  last_date: string | null
  hours_since: number | null
  freshness: string
  exercises: MuscleExerciseContrib[]
}

export type MusclesReport = {
  days: number
  muscles: MuscleDetail[]
  push_sets: number
  pull_sets: number
  upper_sets: number
  lower_sets: number
}

export type BodyMeasurement = {
  id?: number
  date: string
  weight_kg?: number | null
  fat_percent?: number | null
  lean_mass_kg?: number | null
  waist?: number | null
}

export type RelativeLift = {
  template_id: string
  title: string
  primary_muscle: string | null
  best_e1rm: number
  ratio: number
  latest_weight_kg: number | null
  latest_top_reps: number | null
}

export type BodyOverview = {
  latest_weight_kg: number | null
  weight_delta_kg: number | null
  latest_date: string | null
  measurements: BodyMeasurement[]
  relative_strength: RelativeLift[]
}

export type LogMeasurementPayload = {
  date: string
  weight_kg?: number
  fat_percent?: number
  lean_mass_kg?: number
  waist?: number
}

export type CoachExercisePlan = {
  template_id: string
  title: string
  primary_muscle: string | null
  equipment_key: string | null
  action: 'increase_weight' | 'add_reps' | 'ceiling_switch' | 'bodyweight_reps'
  reason: string
  last_date: string
  last_summary: string
  target_weight_kg: number | null
  target_reps: number
  working_sets: number
  plate_load: PlateLoad | null
  next_load: PlateLoad | null
  at_ceiling: boolean
  rest_seconds: number
}

export type MuscleGap = {
  muscle: string
  weekly_rate: number
  suggestion: string
}

export type SplitPlan = {
  split: string
  days_ago: number
  last_date: string
  routine_title: string
  notes: string
  exercises: CoachExercisePlan[]
  muscle_gaps: MuscleGap[]
}

export type CoachOverview = {
  recommended_split: string | null
  splits: SplitPlan[]
}

export type PushRoutineResult = {
  action: 'created' | 'updated'
  routine_id: string | null
  routine_title: string
  folder_id: number | null
  folder_title: string
  exercise_count: number
}

export type Milestone = {
  id: string
  title: string
  current: number
  target: number
  unit: string
  achieved: boolean
  pct: number
}

export type WrappedSummary = {
  period: string
  workouts: number
  hard_sets: number
  total_minutes: number
  avg_minutes: number
  total_volume_kg: number
  car_equivalents: number
  favorite_exercise: [string, number] | null
  favorite_muscle: [string, number] | null
  peak_hour: string | null
  peak_weekday: string | null
  biggest_pr: string | null
}

import {
  buildCsvExport,
  computeBody,
  computeCoach,
  computeEquipment,
  computeExerciseDetail,
  computeExercises,
  computeMuscles,
  computeOverview,
  computeReports,
  computeWorkoutDetail,
  computeWorkouts,
} from './engine/analytics'
import { normalizeConfig } from './engine/plates'
import { logBodyViaProxy, pushRoutineViaProxy, syncViaProxy } from './engine/proxyClient'
import { loadCache, saveCache } from './engine/storage'

export type ReportsOverview = {
  wrapped: WrappedSummary
  milestones: Milestone[]
  markdown_digest: string
}

async function callRust<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(text.slice(0, 140) || res.statusText)
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText
    throw new Error(msg)
  }
  return body as T
}

let modePromise: Promise<'rust' | 'vercel'> | null = null
let initialSyncPromise: Promise<void> | null = null

async function getMode(): Promise<'rust' | 'vercel'> {
  if (!modePromise) {
    modePromise = (async () => {
      try {
        const res = await fetch('/api/status')
        const ct = res.headers.get('content-type') || ''
        if (res.ok && ct.includes('application/json')) {
          await res.json()
          return 'rust'
        }
      } catch {
        // Fall through to Vercel serverless proxy + browser cache
      }
      return 'vercel'
    })()
  }
  return modePromise
}

async function cachedState() {
  const state = await loadCache()
  if (!state.last_sync) {
    if (!initialSyncPromise) {
      initialSyncPromise = syncViaProxy(true).then(() => undefined)
    }
    await initialSyncPromise
    return loadCache()
  }
  return state
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const api = {
  status: async (): Promise<Status> => {
    if ((await getMode()) === 'rust') return callRust<Status>('/status')
    const s = await cachedState()
    return { user: s.user, last_sync: s.last_sync, workouts: s.workouts.length }
  },
  overview: async (weeks = 6): Promise<Overview> => {
    if ((await getMode()) === 'rust') return callRust<Overview>(`/overview?weeks=${weeks}`)
    return computeOverview(await cachedState(), weeks)
  },
  workouts: async (): Promise<WorkoutSummary[]> => {
    if ((await getMode()) === 'rust') return callRust<WorkoutSummary[]>('/workouts')
    return computeWorkouts(await cachedState())
  },
  workoutDetail: async (id: string): Promise<WorkoutDetail> => {
    if ((await getMode()) === 'rust')
      return callRust<WorkoutDetail>(`/workouts/${encodeURIComponent(id)}`)
    return computeWorkoutDetail(await cachedState(), id)
  },
  exercises: async (): Promise<ExercisesOverview> => {
    if ((await getMode()) === 'rust') return callRust<ExercisesOverview>('/exercises')
    return computeExercises(await cachedState())
  },
  exerciseDetail: async (id: string): Promise<ExerciseDetail> => {
    if ((await getMode()) === 'rust')
      return callRust<ExerciseDetail>(`/exercises/${encodeURIComponent(id)}`)
    return computeExerciseDetail(await cachedState(), id)
  },
  muscles: async (days = 7): Promise<MusclesReport> => {
    if ((await getMode()) === 'rust') return callRust<MusclesReport>(`/muscles?days=${days}`)
    return computeMuscles(await cachedState(), days)
  },
  body: async (): Promise<BodyOverview> => {
    if ((await getMode()) === 'rust') return callRust<BodyOverview>('/body')
    return computeBody(await cachedState())
  },
  logBody: async (payload: LogMeasurementPayload): Promise<BodyOverview> => {
    if ((await getMode()) === 'rust') {
      return callRust<BodyOverview>('/body', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    const next = await logBodyViaProxy(payload)
    return computeBody(next)
  },
  coach: async (): Promise<CoachOverview> => {
    if ((await getMode()) === 'rust') return callRust<CoachOverview>('/coach')
    return computeCoach(await cachedState())
  },
  pushRoutine: async (
    split: string,
    payload: {
      routine_title: string
      notes: string
      exercises: {
        template_id: string
        weight_kg: number | null
        reps: number
        working_sets: number
        rest_seconds: number
        notes: string
      }[]
    },
  ): Promise<PushRoutineResult> => {
    if ((await getMode()) === 'rust') {
      return callRust<PushRoutineResult>(`/coach/${encodeURIComponent(split)}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    return pushRoutineViaProxy(split, payload)
  },
  reports: async (period: '30d' | 'all' = 'all'): Promise<ReportsOverview> => {
    if ((await getMode()) === 'rust') return callRust<ReportsOverview>(`/reports?period=${period}`)
    return computeReports(await cachedState(), period)
  },
  equipment: async (): Promise<EquipmentConfig> => {
    if ((await getMode()) === 'rust') return callRust<EquipmentConfig>('/equipment')
    return computeEquipment(await cachedState())
  },
  saveEquipment: async (payload: {
    plates: PlateItem[]
    equipment?: Record<string, Omit<EquipmentEntry, 'loads'>>
  }): Promise<EquipmentConfig> => {
    if ((await getMode()) === 'rust') {
      return callRust<EquipmentConfig>('/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }
    const state = await loadCache()
    const nextCfg = normalizeConfig(state.equipment, payload.plates, payload.equipment)
    const nextState = { ...state, equipment: nextCfg }
    await saveCache(nextState)
    return computeEquipment(nextState)
  },
  sync: async (full = false): Promise<unknown> => {
    if ((await getMode()) === 'rust') {
      return callRust<unknown>(`/sync${full ? '?full=true' : ''}`, { method: 'POST' })
    }
    return syncViaProxy(full)
  },
  downloadExport: async (kind: 'csv' | 'json') => {
    if ((await getMode()) === 'rust') {
      window.location.href = `/api/export/${kind}`
      return
    }
    const state = await cachedState()
    if (kind === 'csv') {
      triggerDownload('hevy-sets-export.csv', buildCsvExport(state), 'text/csv;charset=utf-8')
    } else {
      triggerDownload(
        'hevy-backup.json',
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            user: state.user,
            workouts: state.workouts,
            body_measurements: state.measurements,
          },
          null,
          2,
        ),
        'application/json;charset=utf-8',
      )
    }
  },
}
