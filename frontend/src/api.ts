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

export type ReportsOverview = {
  wrapped: WrappedSummary
  milestones: Milestone[]
  markdown_digest: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body
}

export const api = {
  status: () => call<Status>('/status'),
  overview: (weeks = 6) => call<Overview>(`/overview?weeks=${weeks}`),
  workouts: () => call<WorkoutSummary[]>('/workouts'),
  workoutDetail: (id: string) => call<WorkoutDetail>(`/workouts/${encodeURIComponent(id)}`),
  exercises: () => call<ExercisesOverview>('/exercises'),
  exerciseDetail: (id: string) => call<ExerciseDetail>(`/exercises/${encodeURIComponent(id)}`),
  muscles: (days = 7) => call<MusclesReport>(`/muscles?days=${days}`),
  body: () => call<BodyOverview>('/body'),
  logBody: (payload: LogMeasurementPayload) =>
    call<BodyOverview>('/body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  coach: () => call<CoachOverview>('/coach'),
  pushRoutine: (
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
  ) =>
    call<PushRoutineResult>(`/coach/${encodeURIComponent(split)}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  reports: (period: '30d' | 'all' = 'all') => call<ReportsOverview>(`/reports?period=${period}`),
  equipment: () => call<EquipmentConfig>('/equipment'),
  saveEquipment: (payload: {
    plates: PlateItem[]
    equipment?: Record<string, Omit<EquipmentEntry, 'loads'>>
  }) =>
    call<EquipmentConfig>('/equipment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  sync: (full = false) => call<unknown>(`/sync${full ? '?full=true' : ''}`, { method: 'POST' }),
}
