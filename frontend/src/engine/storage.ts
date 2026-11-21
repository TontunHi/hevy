import type { CachedState, StoredEquipmentConfig } from './types'

export const DEFAULT_EQUIPMENT: StoredEquipmentConfig = {
  plates: [
    { kg: 2.5, count: 4 },
    { kg: 2.0, count: 4 },
    { kg: 1.5, count: 4 },
  ],
  equipment: {
    dumbbell_pair: {
      label: 'Dumbbells (pair)',
      stacks: 4,
      counted: 2,
      base_kg: 0,
    },
    dumbbell_single: {
      label: 'Dumbbell (one-arm)',
      stacks: 2,
      counted: 2,
      base_kg: 0,
    },
    barbell: {
      label: 'Barbell',
      stacks: 2,
      counted: 2,
      base_kg: 0.5,
    },
    lat_pulldown: {
      label: 'Lat pulldown (2 dumbbells as counterweight)',
      stacks: 2,
      counted: 2,
      base_kg: 0,
    },
  },
  hevy_equipment: {
    dumbbell: 'dumbbell_pair',
    barbell: 'barbell',
    machine: 'lat_pulldown',
    cable: 'lat_pulldown',
  },
  exercise_overrides: {},
}

const DB_NAME = 'hevy_ledger_v1'
const STORE = 'state'
const KEY = 'cache'

function emptyState(): CachedState {
  return {
    user: null,
    last_sync: null,
    templates_synced_at: null,
    workouts: [],
    templates: [],
    measurements: [],
    equipment: structuredClone(DEFAULT_EQUIPMENT),
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadCache(): Promise<CachedState> {
  try {
    const db = await openDb()
    const val = await new Promise<CachedState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result as CachedState | undefined)
      req.onerror = () => reject(req.error)
    })
    if (!val) return emptyState()
    return {
      ...emptyState(),
      ...val,
      equipment: val.equipment ?? structuredClone(DEFAULT_EQUIPMENT),
    }
  } catch {
    const raw = localStorage.getItem(DB_NAME)
    if (!raw) return emptyState()
    try {
      return { ...emptyState(), ...(JSON.parse(raw) as Partial<CachedState>) }
    } catch {
      return emptyState()
    }
  }
}

export async function saveCache(state: CachedState): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(state, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    localStorage.setItem(DB_NAME, JSON.stringify(state))
  }
}
