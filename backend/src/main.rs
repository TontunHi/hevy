mod body;
mod coach;
mod db;
mod exercises;
mod hevy;
mod metrics;
mod muscles;
mod plates;
mod reports;
mod sync;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, RwLock};

struct App {
    db: Mutex<Connection>,
    hevy: hevy::Client,
    cfg: RwLock<plates::Config>,
    equipment_path: String,
}
type S = State<Arc<App>>;

struct AppError(anyhow::Error);
impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(e: E) -> Self {
        Self(e.into())
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        eprintln!("error: {:#}", self.0);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("{:#}", self.0) })))
            .into_response()
    }
}
type R<T> = Result<Json<T>, AppError>;

fn env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.into())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Works whether started from repo root or backend/.
    dotenvy::from_filename("../.env").or_else(|_| dotenvy::dotenv()).ok();
    let root = if std::path::Path::new("equipment.toml").exists() { "." } else { ".." };

    let equipment_path = env("EQUIPMENT_PATH", &format!("{root}/equipment.toml"));
    let app = Arc::new(App {
        db: Mutex::new(db::open(&env("DB_PATH", &format!("{root}/data/hevy.db")))?),
        hevy: hevy::Client::new(
            std::env::var("HEVY_API_KEY")
                .map_err(|_| anyhow::anyhow!("HEVY_API_KEY is not set (put it in .env)"))?,
        ),
        cfg: RwLock::new(plates::Config::load(&equipment_path)?),
        equipment_path,
    });

    let router = Router::new()
        .route("/api/status", get(status))
        .route("/api/sync", post(sync_now))
        .route("/api/overview", get(overview))
        .route("/api/workouts", get(workouts))
        .route("/api/workouts/{id}", get(workout_detail))
        .route("/api/exercises", get(exercises_list))
        .route("/api/exercises/{id}", get(exercise_detail))
        .route("/api/muscles", get(muscles_report))
        .route("/api/body", get(body_get).post(body_post))
        .route("/api/coach", get(coach_overview))
        .route("/api/coach/{split}/push", post(coach_push))
        .route("/api/reports", get(reports_overview))
        .route("/api/export/csv", get(export_csv))
        .route("/api/export/json", get(export_json))
        .route("/api/equipment", get(equipment_get).put(equipment_put))
        .with_state(app);

    let addr = format!("127.0.0.1:{}", env("PORT", "3001"));
    println!("backend listening on http://{addr}");
    axum::serve(tokio::net::TcpListener::bind(&addr).await?, router).await?;
    Ok(())
}

async fn status(State(app): S) -> R<Value> {
    let c = app.db.lock().unwrap();
    let user: Value = db::meta_get(&c, "user")?
        .and_then(|u| serde_json::from_str(&u).ok())
        .unwrap_or(Value::Null);
    let workouts: i64 = c.query_row("SELECT COUNT(*) FROM workouts", [], |r| r.get(0))?;
    Ok(Json(json!({
        "user": user,
        "last_sync": db::meta_get(&c, "last_sync")?,
        "workouts": workouts,
    })))
}

#[derive(Deserialize)]
struct SyncQ {
    #[serde(default)]
    full: bool,
}
async fn sync_now(State(app): S, Query(q): Query<SyncQ>) -> R<sync::Report> {
    Ok(Json(sync::run(&app.hevy, &app.db, q.full).await?))
}

#[derive(Deserialize)]
struct OverviewQ {
    weeks: Option<usize>,
}
async fn overview(State(app): S, Query(q): Query<OverviewQ>) -> R<metrics::Overview> {
    let c = app.db.lock().unwrap();
    Ok(Json(metrics::overview(&db::all_sets(&c)?, db::measurements(&c)?, q.weeks.unwrap_or(12))))
}

async fn workouts(State(app): S) -> R<Vec<metrics::WorkoutSummary>> {
    let c = app.db.lock().unwrap();
    Ok(Json(metrics::workout_summaries(&db::all_sets(&c)?)))
}

#[derive(Serialize)]
struct WorkoutDetailExercise {
    index: i64,
    title: String,
    template_id: String,
    primary_muscle: Option<String>,
    secondary_muscles: Vec<String>,
    equipment_key: Option<String>,
    sets: Vec<hevy::Set>,
    plate_hint: Option<plates::Load>,
    next_weight: Option<plates::Load>,
}

#[derive(Serialize)]
struct WorkoutDetail {
    id: String,
    title: String,
    start_time: String,
    end_time: String,
    exercises: Vec<WorkoutDetailExercise>,
}

async fn workout_detail(State(app): S, Path(id): Path<String>) -> Result<Json<WorkoutDetail>, AppError> {
    let c = app.db.lock().unwrap();
    let w = db::workout_by_id(&c, &id)?
        .ok_or_else(|| anyhow::anyhow!("workout {id} not found"))?;
    let templates = db::templates_map(&c)?;

    let cfg = app.cfg.read().unwrap().clone();
    let exercises = w
        .exercises
        .into_iter()
        .map(|e| {
            let tpl = templates.get(&e.exercise_template_id);
            let eq_key = cfg
                .equipment_for(&e.exercise_template_id, tpl.and_then(|t| t.equipment.as_deref()))
                .map(str::to_string);
            let top_weight = e
                .sets
                .iter()
                .filter(|s| s.set_type != "warmup")
                .filter_map(|s| s.weight_kg)
                .fold(None, |acc: Option<f64>, w| Some(acc.map_or(w, |a| a.max(w))));
            let plate_hint = match (eq_key.as_deref(), top_weight) {
                (Some(eq), Some(w)) => cfg.find_load(eq, w),
                _ => None,
            };
            let next_weight = match (eq_key.as_deref(), top_weight) {
                (Some(eq), Some(w)) => cfg.next_up(eq, w),
                _ => None,
            };
            WorkoutDetailExercise {
                index: e.index,
                title: e.title,
                template_id: e.exercise_template_id,
                primary_muscle: tpl.map(|t| t.primary_muscle_group.clone()),
                secondary_muscles: tpl.map(|t| t.secondary_muscle_groups.clone()).unwrap_or_default(),
                equipment_key: eq_key,
                sets: e.sets,
                plate_hint,
                next_weight,
            }
        })
        .collect();

    Ok(Json(WorkoutDetail {
        id: w.id,
        title: w.title,
        start_time: w.start_time,
        end_time: w.end_time,
        exercises,
    }))
}

async fn exercises_list(State(app): S) -> R<exercises::ExercisesOverview> {
    let c = app.db.lock().unwrap();
    let cfg = app.cfg.read().unwrap();
    Ok(Json(exercises::list(&db::all_sets(&c)?, &db::templates_map(&c)?, &cfg)))
}

async fn exercise_detail(State(app): S, Path(id): Path<String>) -> R<exercises::ExerciseDetail> {
    let c = app.db.lock().unwrap();
    let cfg = app.cfg.read().unwrap();
    let d = exercises::detail(&id, &db::all_sets(&c)?, &db::templates_map(&c)?, &cfg)
        .ok_or_else(|| anyhow::anyhow!("exercise {id} not found"))?;
    Ok(Json(d))
}

#[derive(Deserialize)]
struct MusclesQ {
    days: Option<i64>,
}
async fn muscles_report(State(app): S, Query(q): Query<MusclesQ>) -> R<muscles::MusclesReport> {
    let c = app.db.lock().unwrap();
    Ok(Json(muscles::report(&db::all_sets(&c)?, q.days.unwrap_or(7))))
}

async fn body_get(State(app): S) -> R<body::BodyOverview> {
    let c = app.db.lock().unwrap();
    let cfg = app.cfg.read().unwrap();
    let ex = exercises::list(&db::all_sets(&c)?, &db::templates_map(&c)?, &cfg);
    Ok(Json(body::overview(db::measurements_json(&c)?, &ex.exercises)))
}

async fn body_post(State(app): S, Json(input): Json<body::LogMeasurement>) -> R<body::BodyOverview> {
    let payload = input.to_hevy_payload()?;
    let exists = {
        let c = app.db.lock().unwrap();
        db::measurement_exists(&c, &input.date)?
    };
    app.hevy.upsert_measurement(&input.date, &payload, exists).await?;
    let fresh = app.hevy.measurements().await?;
    let c = app.db.lock().unwrap();
    db::replace_measurements(&c, &fresh)?;
    let cfg = app.cfg.read().unwrap();
    let ex = exercises::list(&db::all_sets(&c)?, &db::templates_map(&c)?, &cfg);
    Ok(Json(body::overview(db::measurements_json(&c)?, &ex.exercises)))
}

async fn coach_overview(State(app): S) -> R<coach::CoachOverview> {
    let c = app.db.lock().unwrap();
    let cfg = app.cfg.read().unwrap();
    Ok(Json(coach::build_all(&db::all_sets(&c)?, &db::templates_map(&c)?, &cfg)))
}

async fn coach_push(
    State(app): S,
    Path(split): Path<String>,
    Json(req): Json<coach::PushRoutineRequest>,
) -> R<coach::PushRoutineResult> {
    let plan = {
        let c = app.db.lock().unwrap();
        let cfg = app.cfg.read().unwrap();
        let all = coach::build_all(&db::all_sets(&c)?, &db::templates_map(&c)?, &cfg);
        all.splits
            .into_iter()
            .find(|s| s.split.eq_ignore_ascii_case(&split))
            .ok_or_else(|| anyhow::anyhow!("split '{split}' not found"))?
    };

    const FOLDER_TITLE: &str = "Hevy Ledger";
    let folders = app.hevy.routine_folders().await?;
    let folder_id = match folders
        .iter()
        .find(|f| f["title"].as_str() == Some(FOLDER_TITLE))
        .and_then(|f| f["id"].as_i64())
    {
        Some(id) => Some(id),
        None => app.hevy.create_routine_folder(FOLDER_TITLE).await?["id"].as_i64(),
    };

    let target_title = req
        .routine_title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&plan.routine_title)
        .to_string();

    let routines = app.hevy.routines().await?;
    let existing_id = routines
        .iter()
        .find(|r| r["title"].as_str() == Some(target_title.as_str()))
        .and_then(|r| r["id"].as_str())
        .map(str::to_string);

    let payload = coach::to_hevy_routine_payload(&plan, &req, folder_id, existing_id.is_some());
    let exercise_count = payload["exercises"].as_array().map(|a| a.len()).unwrap_or(0);

    let (action, saved) = if let Some(rid) = &existing_id {
        ("updated", app.hevy.update_routine(rid, &payload).await?)
    } else {
        ("created", app.hevy.create_routine(&payload).await?)
    };

    Ok(Json(coach::PushRoutineResult {
        action,
        routine_id: saved["id"].as_str().map(str::to_string).or(existing_id),
        routine_title: target_title,
        folder_id,
        folder_title: FOLDER_TITLE.into(),
        exercise_count,
    }))
}

#[derive(Deserialize)]
struct ReportsQ {
    period: Option<String>,
}
async fn reports_overview(State(app): S, Query(q): Query<ReportsQ>) -> R<reports::ReportsOverview> {
    let c = app.db.lock().unwrap();
    let cfg = app.cfg.read().unwrap();
    Ok(Json(reports::build(
        &db::all_sets(&c)?,
        &db::templates_map(&c)?,
        db::measurements(&c)?,
        &cfg,
        q.period.as_deref().unwrap_or("all"),
    )))
}

async fn export_csv(State(app): S) -> Result<Response, AppError> {
    let csv = {
        let c = app.db.lock().unwrap();
        reports::sets_to_csv(&db::all_sets(&c)?)
    };
    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (axum::http::header::CONTENT_DISPOSITION, "attachment; filename=\"hevy-sets-export.csv\""),
        ],
        csv,
    )
        .into_response())
}

async fn export_json(State(app): S) -> Result<Response, AppError> {
    let body = {
        let c = app.db.lock().unwrap();
        let user: Value = db::meta_get(&c, "user")?
            .and_then(|u| serde_json::from_str(&u).ok())
            .unwrap_or(Value::Null);
        let mut stmt = c.prepare("SELECT json FROM workouts ORDER BY start_time DESC")?;
        let workouts: Vec<Value> = stmt
            .query_map([], |r| {
                let s: String = r.get(0)?;
                Ok(serde_json::from_str::<Value>(&s).unwrap_or(Value::Null))
            })?
            .collect::<Result<_, _>>()?;
        serde_json::to_string_pretty(&json!({
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "user": user,
            "workouts": workouts,
            "body_measurements": db::measurements_json(&c)?,
        }))?
    };
    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "application/json; charset=utf-8"),
            (axum::http::header::CONTENT_DISPOSITION, "attachment; filename=\"hevy-backup.json\""),
        ],
        body,
    )
        .into_response())
}

#[derive(Deserialize)]
struct UpdateEquipmentReq {
    plates: Vec<plates::Plate>,
    equipment: Option<BTreeMap<String, plates::Equipment>>,
}

fn equipment_payload(cfg: &plates::Config) -> Value {
    let eq: serde_json::Map<String, Value> = cfg
        .equipment
        .iter()
        .map(|(k, e)| {
            (
                k.clone(),
                json!({
                    "label": e.label,
                    "stacks": e.stacks,
                    "counted": e.counted,
                    "base_kg": e.base_kg,
                    "loads": cfg.loads(k),
                }),
            )
        })
        .collect();
    json!({
        "plates": cfg.plates,
        "equipment": Value::Object(eq),
        "hevy_equipment": cfg.hevy_equipment,
    })
}

async fn equipment_get(State(app): S) -> Json<Value> {
    let cfg = app.cfg.read().unwrap();
    Json(equipment_payload(&cfg))
}

async fn equipment_put(State(app): S, Json(req): Json<UpdateEquipmentReq>) -> R<Value> {
    let mut next = app.cfg.read().unwrap().clone();
    next.plates = req.plates;
    if let Some(eq) = req.equipment {
        next.equipment = eq;
    }
    next.normalize_and_validate()?;
    next.save(&app.equipment_path)?;
    let out = equipment_payload(&next);
    *app.cfg.write().unwrap() = next;
    Ok(Json(out))
}
