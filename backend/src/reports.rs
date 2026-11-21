//! Wrapped stats, training milestones, weekly Markdown digest, and CSV/JSON export.

use crate::coach;
use crate::db::{SetRow, TemplateMap};
use crate::exercises::{self, epley};
use crate::metrics::{self, is_hard};
use crate::muscles;
use crate::plates;
use chrono::{DateTime, Datelike, Duration, Local, Timelike};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};

#[derive(Serialize)]
pub struct Milestone {
    pub id: &'static str,
    pub title: &'static str,
    pub current: f64,
    pub target: f64,
    pub unit: &'static str,
    pub achieved: bool,
    pub pct: u32,
}

#[derive(Serialize)]
pub struct WrappedSummary {
    pub period: String,
    pub workouts: usize,
    pub hard_sets: usize,
    pub total_minutes: f64,
    pub avg_minutes: f64,
    pub total_volume_kg: f64,
    pub car_equivalents: f64,
    pub favorite_exercise: Option<(String, usize)>,
    pub favorite_muscle: Option<(String, f64)>,
    pub peak_hour: Option<String>,
    pub peak_weekday: Option<String>,
    pub biggest_pr: Option<String>,
}

#[derive(Serialize)]
pub struct ReportsOverview {
    pub wrapped: WrappedSummary,
    pub milestones: Vec<Milestone>,
    pub markdown_digest: String,
}

fn milestone(
    id: &'static str,
    title: &'static str,
    current: f64,
    target: f64,
    unit: &'static str,
) -> Milestone {
    let pct = ((current / target).clamp(0.0, 1.0) * 100.0).round() as u32;
    Milestone {
        id,
        title,
        current: (current * 10.0).round() / 10.0,
        target,
        unit,
        achieved: current >= target,
        pct,
    }
}

pub fn build(
    rows: &[SetRow],
    templates: &TemplateMap,
    measurements: Vec<(String, Option<f64>)>,
    cfg: &plates::Config,
    period: &str,
) -> ReportsOverview {
    let today = Local::now().date_naive();
    let cutoff = if period == "30d" {
        Some(today - Duration::days(29))
    } else {
        None
    };

    let filtered: Vec<SetRow> = rows
        .iter()
        .filter(|r| match cutoff {
            Some(c) => DateTime::parse_from_rfc3339(&r.start_time)
                .ok()
                .map(|t| t.with_timezone(&Local).date_naive() >= c)
                .unwrap_or(false),
            None => true,
        })
        .cloned()
        .collect();

    let mut workout_durations: HashMap<&str, f64> = HashMap::new();
    let mut hour_counts: HashMap<u32, BTreeSet<&str>> = HashMap::new();
    let mut weekday_counts: HashMap<String, BTreeSet<&str>> = HashMap::new();
    let mut ex_sets: HashMap<&str, usize> = HashMap::new();
    let mut muscle_sets: HashMap<&str, f64> = HashMap::new();
    let mut hard_sets = 0usize;
    let mut total_volume_kg = 0.0f64;

    for r in &filtered {
        if let (Ok(st), Ok(en)) = (
            DateTime::parse_from_rfc3339(&r.start_time),
            DateTime::parse_from_rfc3339(&r.end_time),
        ) {
            let st_local = st.with_timezone(&Local);
            workout_durations
                .entry(&r.workout_id)
                .or_insert_with(|| ((en - st).num_seconds() as f64 / 60.0).max(0.0));
            hour_counts
                .entry(st_local.hour())
                .or_default()
                .insert(&r.workout_id);
            weekday_counts
                .entry(st_local.weekday().to_string())
                .or_default()
                .insert(&r.workout_id);
        }

        if !is_hard(r) {
            continue;
        }
        hard_sets += 1;
        total_volume_kg += r.weight_kg.unwrap_or(0.0) * r.reps.unwrap_or(0) as f64;
        *ex_sets.entry(&r.exercise_title).or_default() += 1;
        if let Some(p) = &r.primary_muscle {
            *muscle_sets.entry(p.as_str()).or_default() += 1.0;
        }
        for s in &r.secondary {
            *muscle_sets.entry(s.as_str()).or_default() += 0.5;
        }
    }

    let workouts = workout_durations.len();
    let total_minutes = workout_durations.values().sum::<f64>().round();
    let avg_minutes = if workouts > 0 {
        (total_minutes / workouts as f64).round()
    } else {
        0.0
    };
    total_volume_kg = total_volume_kg.round();
    let car_equivalents = ((total_volume_kg / 1300.0) * 10.0).round() / 10.0;

    let favorite_exercise = ex_sets
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(a.0)))
        .map(|(k, v)| (k.to_string(), v));
    let favorite_muscle = muscle_sets
        .into_iter()
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(k, v)| (k.replace('_', " "), (v * 10.0).round() / 10.0));
    let peak_hour = hour_counts
        .into_iter()
        .max_by_key(|a| a.1.len())
        .map(|(h, _)| format!("{h:02}:00–{:02}:00", (h + 1) % 24));
    let peak_weekday = weekday_counts
        .into_iter()
        .max_by_key(|a| a.1.len())
        .map(|(d, _)| d);

    let ex_ov = exercises::list(&filtered, templates, cfg);
    let biggest_pr = ex_ov
        .pr_feed
        .first()
        .map(|p| format!("{} — {} ({})", p.exercise_title, p.value_label, p.delta_label));

    // Milestones are always all-time totals.
    let all_ov = metrics::overview(rows, measurements, 12);
    let t = &all_ov.totals;
    let tons = t.volume_kg / 1000.0;
    let milestones = vec![
        milestone("w10", "First 10 workouts", t.workouts as f64, 10.0, "workouts"),
        milestone("w25", "25 workouts", t.workouts as f64, 25.0, "workouts"),
        milestone("w50", "50 workouts", t.workouts as f64, 50.0, "workouts"),
        milestone("t10", "10 metric tons lifted", tons, 10.0, "tons"),
        milestone("t25", "25 metric tons lifted", tons, 25.0, "tons"),
        milestone("s100", "100 hard sets", t.hard_sets as f64, 100.0, "sets"),
        milestone("s500", "500 hard sets", t.hard_sets as f64, 500.0, "sets"),
        milestone("str4", "4-week consistency streak", t.streak_weeks as f64, 4.0, "weeks"),
    ];

    // Weekly Markdown digest.
    let m_rep = muscles::report(rows, 7);
    let coach_ov = coach::build_all(rows, templates, cfg);
    let under_target: Vec<String> = m_rep
        .muscles
        .iter()
        .filter(|m| m.weekly_rate < 10.0)
        .take(4)
        .map(|m| format!("{} ({:.1}/20)", m.muscle.replace('_', " "), m.weekly_rate))
        .collect();
    let pr_lines: Vec<String> = ex_ov
        .pr_feed
        .iter()
        .take(3)
        .map(|p| format!("- {} ({}): {} ({})", p.exercise_title, p.date, p.value_label, p.delta_label))
        .collect();

    let markdown_digest = format!(
        "# Hevy Weekly Digest ({})\n\n\
         - **This week:** {} workouts · {} hard sets · {} min · {} kg volume\n\
         - **Streak:** {} consecutive weeks (≥2 sessions/wk)\n\
         - **7d Push : Pull:** {:.1} : {:.1} sets\n\
         - **Train next:** {}\n\
         - **Muscles under 10 sets/wk:** {}\n\n\
         ## Recent PRs\n{}",
        today,
        all_ov.this_week.workouts,
        all_ov.this_week.hard_sets,
        all_ov.this_week.duration_min,
        all_ov.this_week.volume_kg,
        all_ov.totals.streak_weeks,
        m_rep.push_sets,
        m_rep.pull_sets,
        coach_ov.recommended_split.as_deref().unwrap_or("—"),
        if under_target.is_empty() { "None".into() } else { under_target.join(", ") },
        if pr_lines.is_empty() { "- No PRs in this range yet".into() } else { pr_lines.join("\n") },
    );

    ReportsOverview {
        wrapped: WrappedSummary {
            period: if period == "30d" { "Last 30 days".into() } else { "All time".into() },
            workouts,
            hard_sets,
            total_minutes,
            avg_minutes,
            total_volume_kg,
            car_equivalents,
            favorite_exercise,
            favorite_muscle,
            peak_hour,
            peak_weekday,
            biggest_pr,
        },
        milestones,
        markdown_digest,
    }
}

fn csv_escape(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

pub fn sets_to_csv(rows: &[SetRow]) -> String {
    let mut out = String::from(
        "workout_id,date,workout_title,exercise_title,primary_muscle,set_type,weight_kg,reps,e1rm_kg\n",
    );
    for r in rows {
        let date = DateTime::parse_from_rfc3339(&r.start_time)
            .ok()
            .map(|t| t.with_timezone(&Local).date_naive().to_string())
            .unwrap_or_default();
        let w = r.weight_kg.map(|v| v.to_string()).unwrap_or_default();
        let reps = r.reps.map(|v| v.to_string()).unwrap_or_default();
        let e1rm = match (r.set_type != "warmup", r.weight_kg, r.reps) {
            (true, Some(wt), Some(rp)) if wt > 0.0 && rp > 0 => format!("{:.1}", epley(wt, rp)),
            _ => String::new(),
        };
        out.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            csv_escape(&r.workout_id),
            csv_escape(&date),
            csv_escape(&r.workout_title),
            csv_escape(&r.exercise_title),
            csv_escape(r.primary_muscle.as_deref().unwrap_or("")),
            csv_escape(&r.set_type),
            w,
            reps,
            e1rm
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_escapes_commas_and_computes_e1rm() {
        let rows = vec![SetRow {
            workout_id: "w1".into(),
            workout_title: "Push, Day".into(),
            start_time: "2026-11-20T10:00:00Z".into(),
            end_time: "2026-11-20T10:50:00Z".into(),
            template_id: "t1".into(),
            exercise_title: "Bench Press".into(),
            set_type: "normal".into(),
            weight_kg: Some(8.0),
            reps: Some(12),
            primary_muscle: Some("chest".into()),
            secondary: vec![],
            equipment: Some("dumbbell".into()),
        }];
        let csv = sets_to_csv(&rows);
        assert!(csv.contains("\"Push, Day\""));
        assert!(csv.contains(",11.2\n"));
    }
}
