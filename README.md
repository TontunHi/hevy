# Hevy Ledger

Personal hypertrophy dashboard built on the [Hevy API](https://api.hevyapp.com/docs/).
Rust backend (`axum` + `rusqlite` + plate-aware coach) · React frontend (`Vite` + `TypeScript`).

## Run

```powershell
# 1. API key (Hevy Pro -> Settings -> Developer)
#    .env at repo root:  HEVY_API_KEY=...

# 2. Backend  -> http://127.0.0.1:3001
cd backend; cargo run

# 3. Frontend -> http://localhost:5173 (proxies /api to the backend)
cd frontend; npm install; npm run dev
```

## Deploy on Vercel (Zero-Backend Mode)

The repo also includes a Vercel Serverless proxy (`api/hevy.mjs` and `frontend/api/hevy.mjs`)
plus a full client-side analytics & IndexedDB cache engine.

1. Import the repo on Vercel (either Root Directory `.` or `frontend`).
2. Add Environment Variable `HEVY_API_KEY` in Vercel Project Settings.
3. Redeploy — the frontend detects the serverless proxy automatically and caches data in IndexedDB.

Press **Sync** in the UI (or `POST /api/sync`) to pull data. First sync pulls everything;
later syncs only fetch changes via `/v1/workouts/events?since=`. `?full=true` forces a full resync.

## Layout

| Path | What |
|---|---|
| `equipment.toml` | Owned plates + equipment loading rules |
| `backend/src/hevy.rs` | Hevy API client (workouts, routines, folders, measurements) |
| `backend/src/sync.rs` | Incremental sync into SQLite (`data/hevy.db`) |
| `backend/src/metrics.rs` | Weekly stats, splits, heatmap days, 7d muscle sets |
| `backend/src/plates.rs` | Loadable weights + plate breakdown (`cargo test`) |
| `backend/src/exercises.rs` | Epley e1RM, Rep/Weight/Volume PRs, plateau detection |
| `backend/src/muscles.rs` | Anatomical muscle volume + recovery freshness |
| `backend/src/body.rs` | Body measurements + strength-to-bodyweight ratios |
| `backend/src/coach.rs` | Plate-aware progression coach + routine export to Hevy |
| `backend/src/reports.rs` | Wrapped stats, milestones, Markdown digest, CSV export |
| `frontend/src/views/` | Overview, Coach, Muscles, Exercises, Body, Workouts, Reports, Plates |

## API

| Endpoint | |
|---|---|
| `GET /api/status` | User, last sync, workout count |
| `POST /api/sync[?full=true]` | Incremental pull from Hevy |
| `GET /api/overview?weeks=6` | KPIs, weekly series, heatmap, splits, 7d muscles, recent workouts |
| `GET /api/coach` · `POST /api/coach/{split}/push` | Plate-aware next session plan + create/update Hevy routine |
| `GET /api/muscles?days=7` | Muscle volume, freshness, per-exercise contribution |
| `GET /api/exercises` · `GET /api/exercises/{id}` | e1RM trends, PR feed, plateau status |
| `GET /api/body` · `POST /api/body` | Bodyweight & measurements (syncs back to Hevy) + relative strength |
| `GET /api/workouts` · `GET /api/workouts/{id}` | Session list and set-by-set plate breakdown |
| `GET /api/reports?period=all\|30d` | Wrapped summary, milestones, Markdown digest |
| `GET /api/export/csv` · `GET /api/export/json` | Download full workout & measurement backup |
| `GET /api/equipment` | Every loadable weight per equipment with plates per side |
