import { useCallback, useEffect, useState } from 'react'
import { api, type Overview, type Status } from './api'
import { WorkoutDrawer } from './components/WorkoutDrawer'
import { BodyView } from './views/BodyView'
import { CoachView } from './views/CoachView'
import { EquipmentView } from './views/EquipmentView'
import { ExercisesView } from './views/ExercisesView'
import { MusclesView } from './views/MusclesView'
import { OverviewView } from './views/OverviewView'
import { ReportsView } from './views/ReportsView'
import { WorkoutsView } from './views/WorkoutsView'

type Tab = 'overview' | 'coach' | 'muscles' | 'exercises' | 'body' | 'workouts' | 'reports' | 'equipment'

const TAB_TITLE: Record<Tab, string> = {
  overview: 'Overview',
  coach: 'Coach',
  muscles: 'Muscles',
  exercises: 'Exercises',
  body: 'Body',
  workouts: 'Workouts',
  reports: 'Reports',
  equipment: 'Plates & gym',
}

function readHashTab(): Tab {
  const h = window.location.hash.replace('#', '')
  return h in TAB_TITLE ? (h as Tab) : 'overview'
}

function buildFinding(data?: Overview): string {
  if (!data) return 'Loading training telemetry…'
  const parts: string[] = []
  const topSplit = data.splits[0]
  if (topSplit) {
    parts.push(`Train next: ${topSplit.title} (${topSplit.days_ago}d since last)`)
  }
  const lowBack = data.muscles_7d.filter((m) => m.muscle === 'lats' || m.muscle === 'upper_back')
  if (lowBack.length > 0 && lowBack.every((m) => m.sets < 6)) {
    parts.push(`Lats & upper back at ${lowBack[0].sets} of 10–20 weekly sets`)
  }
  if (data.balance_7d.pull_sets > 0) {
    parts.push(`7d Push ${data.balance_7d.push_sets} : Pull ${data.balance_7d.pull_sets}`)
  }
  return parts.join(' · ') || 'Hypertrophy logbook synced with Hevy'
}

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="9" width="4" height="14" rx="1" fill="#3b82f6" />
      <rect x="9" y="6" width="3.5" height="20" rx="1" fill="#f4f4f5" />
      <rect x="12.5" y="14.5" width="7" height="3" fill="#f4f4f5" />
      <rect x="19.5" y="6" width="3.5" height="20" rx="1" fill="#f4f4f5" />
      <rect x="24" y="9" width="4" height="14" rx="1" fill="#3b82f6" />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readHashTab)
  const [weeks, setWeeks] = useState<number>(6)
  const [status, setStatus] = useState<Status>()
  const [overview, setOverview] = useState<Overview>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api.status(), api.overview(weeks)])
      setStatus(s)
      setOverview(o)
      setError(undefined)
    } catch (e) {
      setError(String(e))
    }
  }, [weeks])

  useEffect(() => {
    let alive = true
    Promise.all([api.status(), api.overview(weeks)])
      .then(([s, o]) => {
        if (!alive) return
        setStatus(s)
        setOverview(o)
        setError(undefined)
      })
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [weeks])

  const sync = async () => {
    setBusy(true)
    try {
      await api.sync()
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const switchTab = (next: Tab) => {
    setTab(next)
    window.location.hash = next
    setMenuOpen(false)
  }

  useEffect(() => {
    const onHash = () => setTab(readHashTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <BrandMark />
            <span className="brand-name">Hevy Ledger</span>
          </div>

          <nav className={`topnav ${menuOpen ? 'open' : ''}`} aria-label="Main">
            {(Object.keys(TAB_TITLE) as Tab[]).map((key) => (
              <button
                key={key}
                className="nav-tab"
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => switchTab(key)}
              >
                {TAB_TITLE[key]}
              </button>
            ))}
          </nav>

          <div className="topbar-right">
            <span className="athlete-chip num">
              @{status?.user?.username ?? '—'} · {status?.workouts ?? 0} workouts
            </span>
            <button className="btn-primary" onClick={sync} disabled={busy}>
              {busy ? 'Syncing…' : 'Sync'}
            </button>
            <button
              className="btn-ghost mobile-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
      </header>

      <main className="canvas">
        <div className="title-row">
          <div>
            <h1>{TAB_TITLE[tab]}</h1>
            <p className="finding">
              {tab === 'overview'
                ? buildFinding(overview)
                : tab === 'coach'
                  ? 'Plate-aware progression plan ready to export directly into your Hevy app'
                  : tab === 'muscles'
                    ? 'Anatomical hypertrophy volume and recovery freshness'
                    : tab === 'exercises'
                      ? 'Estimated 1RM trends, Rep PRs at fixed weight, and plateau detection'
                      : tab === 'body'
                        ? 'Bodyweight log (syncs to Hevy) and strength-to-bodyweight ratios'
                        : tab === 'workouts'
                          ? 'All synced Hevy sessions with exercise & plate breakdowns'
                          : tab === 'reports'
                            ? 'Wrapped summary, training milestones, weekly digest, and CSV/JSON export'
                            : 'Dynamic plate inventory, bar weights, and loadable progression steps'}
            </p>
          </div>

          <div className="title-actions">
            <span className="stamp num">
              {status?.last_sync
                ? `Synced ${new Date(status.last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Not synced'}
            </span>

            {tab === 'overview' && (
              <div className="segmented" role="group" aria-label="Week window">
                {[6, 12, 24].map((w) => (
                  <button key={w} aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
                    {w}w
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="notice-error" style={{ marginBottom: 16 }}>
            <span>{error}</span>
            <button className="btn-ghost" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {tab === 'overview' && overview && (
          <OverviewView
            data={overview}
            onSelectWorkout={setActiveWorkoutId}
            onViewAllWorkouts={() => switchTab('workouts')}
            onOpenCoach={() => switchTab('coach')}
          />
        )}

        {tab === 'coach' && <CoachView />}

        {tab === 'muscles' && <MusclesView />}

        {tab === 'exercises' && <ExercisesView />}

        {tab === 'body' && <BodyView />}

        {tab === 'workouts' && <WorkoutsView onSelectWorkout={setActiveWorkoutId} />}

        {tab === 'reports' && <ReportsView />}

        {tab === 'equipment' && <EquipmentView />}
      </main>

      <WorkoutDrawer workoutId={activeWorkoutId} onClose={() => setActiveWorkoutId(null)} />
    </div>
  )
}
