import type { LogMeasurementPayload, PushRoutineResult } from '../api'
import { computeCoach } from './analytics'
import { loadCache, saveCache } from './storage'
import type { CachedState, RawMeasurement, RawTemplate, RawUser, RawWorkout } from './types'

async function hevyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/hevy?path=${encodeURIComponent(path)}`, init)
  const text = await res.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    throw new Error(text.slice(0, 140) || res.statusText)
  }
  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : res.statusText
    throw new Error(msg)
  }
  return parsed as T
}

async function allPages<T>(basePath: string, field: string, pageSize: number): Promise<T[]> {
  const out: T[] = []
  let page = 1
  const sep = basePath.includes('?') ? '&' : '?'
  while (true) {
    const v = await hevyFetch<Record<string, unknown>>(
      `${basePath}${sep}page=${page}&pageSize=${pageSize}`,
    )
    const items = (v[field] as T[] | undefined) ?? []
    out.push(...items)
    const pageCount = Number(v.page_count ?? 1)
    if (page >= pageCount) return out
    page++
  }
}

export async function syncViaProxy(full = false): Promise<CachedState> {
  const state = await loadCache()
  const since = !full && state.last_sync ? state.last_sync : '1970-01-01T00:00:00Z'
  const started = `${new Date().toISOString().slice(0, 19)}Z`

  type Event = { type: 'updated'; workout: RawWorkout } | { type: 'deleted'; id: string }
  const events = await allPages<Event>(
    `/v1/workouts/events?since=${encodeURIComponent(since)}`,
    'events',
    10,
  )

  const staleTemplates =
    full ||
    state.templates.length === 0 ||
    !state.templates_synced_at ||
    Date.now() - new Date(state.templates_synced_at).getTime() > 7 * 86_400_000

  const [templates, measurements, userRes] = await Promise.all([
    staleTemplates ? allPages<RawTemplate>('/v1/exercise_templates', 'exercise_templates', 100) : null,
    allPages<RawMeasurement>('/v1/body_measurements', 'body_measurements', 10),
    hevyFetch<{ data: RawUser }>('/v1/user/info'),
  ])

  const byId = new Map(state.workouts.map((w) => [w.id, w]))
  for (const ev of events) {
    if (ev.type === 'updated') byId.set(ev.workout.id, ev.workout)
    else if (ev.type === 'deleted') byId.delete(ev.id)
  }

  const next: CachedState = {
    ...state,
    user: userRes.data,
    workouts: Array.from(byId.values()),
    templates: templates ?? state.templates,
    templates_synced_at: templates ? started : state.templates_synced_at,
    measurements,
    last_sync: started,
  }
  await saveCache(next)
  return next
}

export async function logBodyViaProxy(payload: LogMeasurementPayload): Promise<CachedState> {
  const state = await loadCache()
  const exists = state.measurements.some((m) => m.date === payload.date)
  const path = exists ? `/v1/body_measurements/${encodeURIComponent(payload.date)}` : '/v1/body_measurements'
  await hevyFetch(path, {
    method: exists ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const measurements = await allPages<RawMeasurement>('/v1/body_measurements', 'body_measurements', 10)
  const next: CachedState = { ...state, measurements }
  await saveCache(next)
  return next
}

export async function pushRoutineViaProxy(
  split: string,
  req: {
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
): Promise<PushRoutineResult> {
  const state = await loadCache()
  const plan = computeCoach(state).splits.find((s) => s.split.toLowerCase() === split.toLowerCase())
  if (!plan) throw new Error(`Split '${split}' not found`)

  const FOLDER_TITLE = 'Hevy Ledger'
  const folders = await allPages<{ id: number; title: string }>('/v1/routine_folders', 'routine_folders', 10)
  let folderId = folders.find((f) => f.title === FOLDER_TITLE)?.id ?? null
  if (folderId === null) {
    const created = await hevyFetch<{ routine_folder?: { id: number }; id?: number }>(
      '/v1/routine_folders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine_folder: { title: FOLDER_TITLE } }),
      },
    )
    folderId = created.routine_folder?.id ?? created.id ?? null
  }

  const targetTitle = req.routine_title.trim() || plan.routine_title
  const routines = await allPages<{ id: string; title: string }>('/v1/routines', 'routines', 10)
  const existingId = routines.find((r) => r.title === targetTitle)?.id ?? null

  const exercises = req.exercises.map((o) => ({
    exercise_template_id: o.template_id,
    superset_id: null,
    rest_seconds: o.rest_seconds,
    notes: o.notes,
    sets: Array.from({ length: Math.max(1, o.working_sets) }, () => ({
      type: 'normal',
      weight_kg: o.weight_kg,
      reps: o.reps,
      distance_meters: null,
      duration_seconds: null,
      custom_metric: null,
    })),
  }))

  const routineBody = existingId
    ? { title: targetTitle, notes: req.notes, exercises }
    : { title: targetTitle, folder_id: folderId, notes: req.notes, exercises }

  const saved = await hevyFetch<{ routine?: { id: string }; id?: string }>(
    existingId ? `/v1/routines/${encodeURIComponent(existingId)}` : '/v1/routines',
    {
      method: existingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: routineBody }),
    },
  )

  return {
    action: existingId ? 'updated' : 'created',
    routine_id: saved.routine?.id ?? saved.id ?? existingId,
    routine_title: targetTitle,
    folder_id: folderId,
    folder_title: FOLDER_TITLE,
    exercise_count: exercises.length,
  }
}
