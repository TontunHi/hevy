//! SQLite storage. Workouts are flattened into a `sets` table for easy aggregation.

use crate::hevy::{Template, Workout};
use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

pub fn open(path: &str) -> Result<Connection> {
    if let Some(dir) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(dir)?;
    }
    let db = Connection::open(path)?;
    db.execute_batch(
        "PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS workouts (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, start_time TEXT NOT NULL,
            end_time TEXT NOT NULL, updated_at TEXT NOT NULL, routine_id TEXT, json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sets (
            workout_id TEXT NOT NULL, ex_index INTEGER NOT NULL, set_index INTEGER NOT NULL,
            template_id TEXT NOT NULL, exercise_title TEXT NOT NULL, set_type TEXT NOT NULL,
            weight_kg REAL, reps INTEGER, distance_m REAL, duration_s INTEGER, rpe REAL);
        CREATE INDEX IF NOT EXISTS sets_workout ON sets(workout_id);
        CREATE INDEX IF NOT EXISTS sets_template ON sets(template_id);
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,
            primary_muscle TEXT NOT NULL, secondary TEXT NOT NULL, equipment TEXT,
            is_custom INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS measurements (
            date TEXT PRIMARY KEY, weight_kg REAL, fat_percent REAL, lean_mass_kg REAL,
            json TEXT NOT NULL);",
    )?;
    Ok(db)
}

pub fn meta_get(db: &Connection, key: &str) -> Result<Option<String>> {
    Ok(db
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0))
        .optional()?)
}

pub fn meta_set(db: &Connection, key: &str, value: &str) -> Result<()> {
    db.execute(
        "INSERT INTO meta(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

pub fn upsert_workout(db: &Connection, w: &Workout) -> Result<()> {
    delete_workout(db, &w.id)?;
    db.execute(
        "INSERT INTO workouts(id, title, start_time, end_time, updated_at, routine_id, json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![w.id, w.title, w.start_time, w.end_time, w.updated_at, w.routine_id,
                serde_json::to_string(w)?],
    )?;
    let mut stmt = db.prepare_cached(
        "INSERT INTO sets(workout_id, ex_index, set_index, template_id, exercise_title, set_type,
                          weight_kg, reps, distance_m, duration_s, rpe)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?;
    for e in &w.exercises {
        for s in &e.sets {
            stmt.execute(params![w.id, e.index, s.index, e.exercise_template_id, e.title,
                                 s.set_type, s.weight_kg, s.reps, s.distance_meters,
                                 s.duration_seconds, s.rpe])?;
        }
    }
    Ok(())
}

pub fn delete_workout(db: &Connection, id: &str) -> Result<()> {
    db.execute("DELETE FROM sets WHERE workout_id = ?1", [id])?;
    db.execute("DELETE FROM workouts WHERE id = ?1", [id])?;
    Ok(())
}

pub fn replace_templates(db: &Connection, ts: &[Template]) -> Result<()> {
    db.execute("DELETE FROM templates", [])?;
    let mut stmt = db.prepare(
        "INSERT INTO templates(id, title, kind, primary_muscle, secondary, equipment, is_custom)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for t in ts {
        stmt.execute(params![t.id, t.title, t.kind, t.primary_muscle_group,
                             serde_json::to_string(&t.secondary_muscle_groups)?, t.equipment,
                             t.is_custom])?;
    }
    Ok(())
}

pub fn replace_measurements(db: &Connection, ms: &[Value]) -> Result<()> {
    db.execute("DELETE FROM measurements", [])?;
    let mut stmt = db.prepare(
        "INSERT OR REPLACE INTO measurements(date, weight_kg, fat_percent, lean_mass_kg, json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;
    for m in ms {
        stmt.execute(params![m["date"].as_str(), m["weight_kg"].as_f64(),
                             m["fat_percent"].as_f64(), m["lean_mass_kg"].as_f64(),
                             m.to_string()])?;
    }
    Ok(())
}

/// One logged set joined with its workout and exercise template.
#[derive(Debug, Clone)]
pub struct SetRow {
    pub workout_id: String,
    pub workout_title: String,
    pub start_time: String,
    pub end_time: String,
    pub template_id: String,
    pub exercise_title: String,
    pub set_type: String,
    pub weight_kg: Option<f64>,
    pub reps: Option<i64>,
    pub primary_muscle: Option<String>,
    pub secondary: Vec<String>,
    pub equipment: Option<String>,
}

pub fn all_sets(db: &Connection) -> Result<Vec<SetRow>> {
    let mut stmt = db.prepare(
        "SELECT w.id, w.title, w.start_time, w.end_time, s.template_id, s.exercise_title,
                s.set_type, s.weight_kg, s.reps, t.primary_muscle, t.secondary, t.equipment
         FROM sets s JOIN workouts w ON w.id = s.workout_id
         LEFT JOIN templates t ON t.id = s.template_id
         ORDER BY w.start_time, s.ex_index, s.set_index",
    )?;
    let rows = stmt.query_map([], |r| {
        let secondary: Option<String> = r.get(10)?;
        Ok(SetRow {
            workout_id: r.get(0)?,
            workout_title: r.get(1)?,
            start_time: r.get(2)?,
            end_time: r.get(3)?,
            template_id: r.get(4)?,
            exercise_title: r.get(5)?,
            set_type: r.get(6)?,
            weight_kg: r.get(7)?,
            reps: r.get(8)?,
            primary_muscle: r.get(9)?,
            secondary: secondary
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default(),
            equipment: r.get(11)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn workout_by_id(db: &Connection, id: &str) -> Result<Option<Workout>> {
    let raw: Option<String> = db
        .query_row("SELECT json FROM workouts WHERE id = ?1", [id], |r| r.get(0))
        .optional()?;
    Ok(raw.map(|s| serde_json::from_str(&s)).transpose()?)
}

pub type TemplateMap = std::collections::HashMap<String, Template>;

pub fn templates_map(db: &Connection) -> Result<TemplateMap> {
    let mut stmt = db.prepare(
        "SELECT id, title, kind, primary_muscle, secondary, equipment, is_custom FROM templates",
    )?;
    let rows = stmt.query_map([], |r| {
        let secondary: String = r.get(4)?;
        let custom: i64 = r.get(6)?;
        Ok(Template {
            id: r.get(0)?,
            title: r.get(1)?,
            kind: r.get(2)?,
            primary_muscle_group: r.get(3)?,
            secondary_muscle_groups: serde_json::from_str(&secondary).unwrap_or_default(),
            equipment: r.get(5)?,
            is_custom: custom != 0,
        })
    })?;
    let mut map = std::collections::HashMap::new();
    for t in rows {
        let t = t?;
        map.insert(t.id.clone(), t);
    }
    Ok(map)
}

pub fn measurements(db: &Connection) -> Result<Vec<(String, Option<f64>)>> {
    let mut stmt = db.prepare("SELECT date, weight_kg FROM measurements ORDER BY date")?;
    let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn measurements_json(db: &Connection) -> Result<Vec<Value>> {
    let mut stmt = db.prepare("SELECT json FROM measurements ORDER BY date DESC")?;
    let rows = stmt.query_map([], |r| {
        let s: String = r.get(0)?;
        Ok(serde_json::from_str::<Value>(&s).unwrap_or(Value::Null))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn measurement_exists(db: &Connection, date: &str) -> Result<bool> {
    let count: i64 =
        db.query_row("SELECT COUNT(*) FROM measurements WHERE date = ?1", [date], |r| r.get(0))?;
    Ok(count > 0)
}
