export type RawSet = {
  index: number
  type: string
  weight_kg: number | null
  reps: number | null
  distance_meters: number | null
  duration_seconds: number | null
  rpe: number | null
}

export type RawExercise = {
  index: number
  title: string
  exercise_template_id: string
  sets: RawSet[]
}

export type RawWorkout = {
  id: string
  title: string
  start_time: string
  end_time: string
  updated_at: string
  routine_id: string | null
  exercises: RawExercise[]
}

export type RawTemplate = {
  id: string
  title: string
  type: string
  primary_muscle_group: string
  secondary_muscle_groups?: string[]
  equipment?: string | null
  is_custom: boolean
}

export type RawMeasurement = {
  id?: number
  date: string
  weight_kg?: number | null
  fat_percent?: number | null
  lean_mass_kg?: number | null
  waist?: number | null
}

export type RawUser = {
  name: string
  username: string
  is_pro?: boolean
  weight_unit?: string
}

export type PlateItem = { kg: number; count: number }

export type EquipmentDef = {
  label: string
  stacks: number
  counted: number
  base_kg: number
}

export type StoredEquipmentConfig = {
  plates: PlateItem[]
  equipment: Record<string, EquipmentDef>
  hevy_equipment: Record<string, string>
  exercise_overrides: Record<string, string>
}

export type CachedState = {
  user: RawUser | null
  last_sync: string | null
  templates_synced_at: string | null
  workouts: RawWorkout[]
  templates: RawTemplate[]
  measurements: RawMeasurement[]
  equipment: StoredEquipmentConfig
}
