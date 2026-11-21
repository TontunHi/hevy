//! Muscle balance, effective weekly sets, and recovery freshness.

use crate::db::SetRow;
use crate::metrics::is_hard;
use chrono::{DateTime, Duration, Local, Utc};
use serde::Serialize;
use std::collections::HashMap;

const MUSCLES: &[&str] = &[
    "chest",
    "shoulders",
    "triceps",
    "biceps",
    "forearms",
    "lats",
    "upper_back",
    "traps",
    "abdominals",
    "quadriceps",
    "hamstrings",
    "glutes",
    "adductors",
    "calves",
];

#[derive(Serialize)]
pub struct MuscleExerciseContrib {
    pub template_id: String,
    pub title: String,
    pub sets: f64,
    pub role: &'static str,
}

#[derive(Serialize)]
pub struct MuscleDetail {
    pub muscle: String,
    pub sets: f64,
    pub weekly_rate: f64,
    pub last_date: Option<String>,
    pub hours_since: Option<i64>,
    pub freshness: &'static str,
    pub exercises: Vec<MuscleExerciseContrib>,
}

#[derive(Serialize)]
pub struct MusclesReport {
    pub days: i64,
    pub muscles: Vec<MuscleDetail>,
    pub push_sets: f64,
    pub pull_sets: f64,
    pub upper_sets: f64,
    pub lower_sets: f64,
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub fn report(rows: &[SetRow], days: i64) -> MusclesReport {
    let days = days.clamp(1, 90);
    let now_utc = Utc::now();
    let cutoff = Local::now().date_naive() - Duration::days(days - 1);

    let mut set_counts: HashMap<String, f64> =
        MUSCLES.iter().map(|m| (m.to_string(), 0.0)).collect();
    let mut last_hit: HashMap<String, DateTime<Utc>> = HashMap::new();
    let mut ex_contrib: HashMap<String, HashMap<String, (String, f64, &'static str)>> =
        HashMap::new();

    for r in rows.iter().filter(|r| is_hard(r)) {
        let Ok(dt) = DateTime::parse_from_rfc3339(&r.start_time) else { continue };
        let dt_utc = dt.with_timezone(&Utc);
        let local_date = dt.with_timezone(&Local).date_naive();

        if let Some(p) = &r.primary_muscle {
            last_hit
                .entry(p.clone())
                .and_modify(|cur| *cur = (*cur).max(dt_utc))
                .or_insert(dt_utc);
            if local_date >= cutoff {
                *set_counts.entry(p.clone()).or_default() += 1.0;
                let entry = ex_contrib
                    .entry(p.clone())
                    .or_default()
                    .entry(r.template_id.clone())
                    .or_insert_with(|| (r.exercise_title.clone(), 0.0, "primary"));
                entry.1 += 1.0;
            }
        }

        for m in &r.secondary {
            last_hit
                .entry(m.clone())
                .and_modify(|cur| *cur = (*cur).max(dt_utc))
                .or_insert(dt_utc);
            if local_date >= cutoff {
                *set_counts.entry(m.clone()).or_default() += 0.5;
                let entry = ex_contrib
                    .entry(m.clone())
                    .or_default()
                    .entry(r.template_id.clone())
                    .or_insert_with(|| (r.exercise_title.clone(), 0.0, "secondary"));
                entry.1 += 0.5;
            }
        }
    }

    let get_m = |k: &str| set_counts.get(k).copied().unwrap_or(0.0);
    let push_sets = round1(get_m("chest") + get_m("shoulders") + get_m("triceps"));
    let pull_sets = round1(get_m("lats") + get_m("upper_back") + get_m("traps") + get_m("biceps"));
    let upper_sets = round1(
        get_m("chest")
            + get_m("shoulders")
            + get_m("triceps")
            + get_m("biceps")
            + get_m("lats")
            + get_m("upper_back")
            + get_m("traps"),
    );
    let lower_sets = round1(
        get_m("quadriceps") + get_m("hamstrings") + get_m("glutes") + get_m("calves"),
    );

    let mut muscles: Vec<MuscleDetail> = set_counts
        .into_iter()
        .map(|(muscle, sets)| {
            let weekly_rate = round1(sets * 7.0 / days as f64);
            let last_dt = last_hit.get(&muscle).copied();
            let hours_since = last_dt.map(|dt| (now_utc - dt).num_hours().max(0));
            let last_date =
                last_dt.map(|dt| dt.with_timezone(&Local).date_naive().to_string());
            let freshness = match hours_since {
                None => "Untrained",
                Some(h) if h < 24 => "Fatigued (<24h)",
                Some(h) if h < 48 => "Recovering (24–48h)",
                Some(_) => "Ready (≥48h)",
            };
            let mut exercises: Vec<MuscleExerciseContrib> = ex_contrib
                .remove(&muscle)
                .unwrap_or_default()
                .into_iter()
                .map(|(template_id, (title, s, role))| MuscleExerciseContrib {
                    template_id,
                    title,
                    sets: round1(s),
                    role,
                })
                .collect();
            exercises.sort_by(|a, b| b.sets.total_cmp(&a.sets).then(a.title.cmp(&b.title)));
            MuscleDetail {
                muscle,
                sets: round1(sets),
                weekly_rate,
                last_date,
                hours_since,
                freshness,
                exercises,
            }
        })
        .collect();

    muscles.sort_by(|a, b| b.weekly_rate.total_cmp(&a.weekly_rate).then(a.muscle.cmp(&b.muscle)));

    MusclesReport {
        days,
        muscles,
        push_sets,
        pull_sets,
        upper_sets,
        lower_sets,
    }
}
