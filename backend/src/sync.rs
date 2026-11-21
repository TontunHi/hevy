//! Pull changes from Hevy into SQLite.

use crate::{db, hevy};
use anyhow::Result;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize)]
pub struct Report {
    pub since: String,
    pub updated: usize,
    pub deleted: usize,
    pub templates: Option<usize>,
    pub measurements: usize,
}

const EPOCH: &str = "1970-01-01T00:00:00Z";
const TEMPLATE_MAX_AGE_DAYS: i64 = 7;

pub async fn run(client: &hevy::Client, db: &Mutex<Connection>, full: bool) -> Result<Report> {
    let (since, templates_at) = {
        let c = db.lock().unwrap();
        let since = if full { None } else { db::meta_get(&c, "last_sync")? };
        (since.unwrap_or_else(|| EPOCH.into()), db::meta_get(&c, "templates_synced_at")?)
    };
    let started = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);

    // Network first, then write everything in one short transaction.
    let events = client.workout_events(&since).await?;
    let templates_stale = full
        || templates_at
            .and_then(|t| DateTime::parse_from_rfc3339(&t).ok())
            .is_none_or(|t| Utc::now() - t.with_timezone(&Utc) > Duration::days(TEMPLATE_MAX_AGE_DAYS));
    let templates = if templates_stale { Some(client.templates().await?) } else { None };
    let measurements = client.measurements().await?;
    let user = client.user().await?;

    let mut c = db.lock().unwrap();
    let tx = c.transaction()?;
    let (mut updated, mut deleted) = (0, 0);
    for e in &events {
        match e {
            hevy::Event::Updated { workout } => {
                db::upsert_workout(&tx, workout)?;
                updated += 1;
            }
            hevy::Event::Deleted { id } => {
                db::delete_workout(&tx, id)?;
                deleted += 1;
            }
        }
    }
    if let Some(ts) = &templates {
        db::replace_templates(&tx, ts)?;
        db::meta_set(&tx, "templates_synced_at", &started)?;
    }
    db::replace_measurements(&tx, &measurements)?;
    db::meta_set(&tx, "user", &user.to_string())?;
    db::meta_set(&tx, "last_sync", &started)?;
    tx.commit()?;

    Ok(Report {
        since,
        updated,
        deleted,
        templates: templates.map(|t| t.len()),
        measurements: measurements.len(),
    })
}
