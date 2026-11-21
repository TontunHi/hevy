//! Exercise-level progress: Epley e1RM, weight/rep/volume PRs, and plateau detection.

use crate::db::{SetRow, TemplateMap};
use crate::plates::{self, Load};
use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Serialize, Clone)]
pub struct PrEvent {
    pub date: String,
    pub workout_id: String,
    pub workout_title: String,
    pub template_id: String,
    pub exercise_title: String,
    pub kind: String,
    pub value_label: String,
    pub delta_label: String,
}

#[derive(Serialize)]
pub struct ExerciseSummary {
    pub template_id: String,
    pub title: String,
    pub primary_muscle: Option<String>,
    pub secondary_muscles: Vec<String>,
    pub equipment_key: Option<String>,
    pub sessions: usize,
    pub total_hard_sets: usize,
    pub last_date: String,
    pub days_ago: i64,
    pub best_e1rm: Option<f64>,
    pub best_weight_kg: Option<f64>,
    pub best_reps: Option<i64>,
    pub latest_e1rm: Option<f64>,
    pub latest_weight_kg: Option<f64>,
    pub latest_top_reps: Option<i64>,
    pub e1rm_delta: Option<f64>,
    pub sessions_since_pr: usize,
    pub status: &'static str,
    pub at_ceiling: bool,
    pub next_weight_kg: Option<f64>,
}

#[derive(Serialize)]
pub struct ExercisesOverview {
    pub exercises: Vec<ExerciseSummary>,
    pub pr_feed: Vec<PrEvent>,
}

#[derive(Serialize)]
pub struct ExerciseSetItem {
    pub set_type: String,
    pub weight_kg: Option<f64>,
    pub reps: Option<i64>,
    pub e1rm: Option<f64>,
}

#[derive(Serialize)]
pub struct ExerciseSessionPoint {
    pub workout_id: String,
    pub workout_title: String,
    pub date: String,
    pub hard_sets: usize,
    pub warmup_sets: usize,
    pub volume_kg: f64,
    pub top_weight_kg: Option<f64>,
    pub top_reps: Option<i64>,
    pub best_e1rm: Option<f64>,
    pub prs: Vec<String>,
    pub sets: Vec<ExerciseSetItem>,
}

#[derive(Serialize)]
pub struct ExerciseDetail {
    pub template_id: String,
    pub title: String,
    pub primary_muscle: Option<String>,
    pub secondary_muscles: Vec<String>,
    pub equipment_key: Option<String>,
    pub sessions: usize,
    pub total_hard_sets: usize,
    pub best_e1rm: Option<f64>,
    pub best_weight_kg: Option<f64>,
    pub best_reps: Option<i64>,
    pub best_set_volume: Option<f64>,
    pub sessions_since_pr: usize,
    pub status: &'static str,
    pub plate_hint: Option<Load>,
    pub next_weight: Option<Load>,
    pub at_ceiling: bool,
    pub history: Vec<ExerciseSessionPoint>,
}

/// Epley estimated 1RM, rounded to 0.1 kg.
pub fn epley(weight_kg: f64, reps: i64) -> f64 {
    if weight_kg <= 0.0 || reps <= 0 {
        return 0.0;
    }
    let raw = if reps == 1 {
        weight_kg
    } else {
        weight_kg * (1.0 + reps as f64 / 30.0)
    };
    (raw * 10.0).round() / 10.0
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn local_date(ts: &str) -> Option<chrono::NaiveDate> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|t| t.with_timezone(&Local).date_naive())
}

struct AnalyzedExercise {
    summary: ExerciseSummary,
    best_set_volume: Option<f64>,
    plate_hint: Option<Load>,
    next_weight: Option<Load>,
    history: Vec<ExerciseSessionPoint>,
    prs: Vec<PrEvent>,
}

fn analyze_one(
    template_id: &str,
    rows: &[&SetRow],
    templates: &TemplateMap,
    cfg: &plates::Config,
    today: chrono::NaiveDate,
) -> Option<AnalyzedExercise> {
    let first = *rows.first()?;
    let tpl = templates.get(template_id);
    let title = tpl.map(|t| t.title.clone()).unwrap_or_else(|| first.exercise_title.clone());
    let primary_muscle = tpl
        .map(|t| t.primary_muscle_group.clone())
        .or_else(|| first.primary_muscle.clone());
    let secondary_muscles = tpl
        .map(|t| t.secondary_muscle_groups.clone())
        .unwrap_or_else(|| first.secondary.clone());
    let hevy_eq = tpl
        .and_then(|t| t.equipment.as_deref())
        .or(first.equipment.as_deref());
    let equipment_key = cfg.equipment_for(template_id, hevy_eq).map(str::to_string);

    // Group rows chronologically by (start_time, workout_id).
    let mut by_session: BTreeMap<(String, String), Vec<&SetRow>> = BTreeMap::new();
    for &r in rows {
        by_session
            .entry((r.start_time.clone(), r.workout_id.clone()))
            .or_default()
            .push(r);
    }

    let mut history = Vec::with_capacity(by_session.len());
    let mut prs = Vec::new();
    let mut best_e1rm: Option<f64> = None;
    let mut best_weight: Option<f64> = None;
    let mut best_reps: Option<i64> = None;
    let mut best_set_volume: Option<f64> = None;
    // Keyed in grams so 8.0 kg matches cleanly across sessions.
    let mut reps_at_weight: HashMap<i64, i64> = HashMap::new();
    let mut last_pr_idx: usize = 0;
    let mut total_hard_sets = 0usize;

    for (idx, ((start_ts, workout_id), s_rows)) in by_session.into_iter().enumerate() {
        let date = local_date(&start_ts).unwrap_or(today).to_string();
        let workout_title = s_rows[0].workout_title.clone();

        let mut hard_sets = 0usize;
        let mut warmup_sets = 0usize;
        let mut volume_kg = 0.0f64;
        let mut s_top_weight: Option<f64> = None;
        let mut s_top_reps: Option<i64> = None;
        let mut s_best_e1rm: Option<f64> = None;
        let mut s_best_vol: Option<f64> = None;
        let mut s_reps_by_w: HashMap<i64, i64> = HashMap::new();
        let mut set_items = Vec::with_capacity(s_rows.len());

        for r in s_rows {
            let is_hard = r.set_type != "warmup";
            let w = r.weight_kg.unwrap_or(0.0);
            let reps = r.reps.unwrap_or(0);
            let set_e1rm = if is_hard && w > 0.0 && reps > 0 {
                Some(epley(w, reps))
            } else {
                None
            };
            set_items.push(ExerciseSetItem {
                set_type: r.set_type.clone(),
                weight_kg: r.weight_kg,
                reps: r.reps,
                e1rm: set_e1rm,
            });

            if !is_hard {
                warmup_sets += 1;
                continue;
            }
            hard_sets += 1;
            total_hard_sets += 1;
            if w > 0.0 && reps > 0 {
                let vol = w * reps as f64;
                volume_kg += vol;
                s_best_vol = Some(s_best_vol.map_or(vol, |b| b.max(vol)));
                let g = (w * 1000.0).round() as i64;
                s_reps_by_w
                    .entry(g)
                    .and_modify(|m| *m = (*m).max(reps))
                    .or_insert(reps);
            }
            if let Some(w_opt) = r.weight_kg {
                s_top_weight = Some(s_top_weight.map_or(w_opt, |b| b.max(w_opt)));
            }
            if let Some(rp) = r.reps {
                s_top_reps = Some(s_top_reps.map_or(rp, |b| b.max(rp)));
            }
            if let Some(e) = set_e1rm {
                s_best_e1rm = Some(s_best_e1rm.map_or(e, |b| b.max(e)));
            }
        }

        let mut session_prs = Vec::new();
        if idx > 0 {
            if let (Some(prev), Some(cur)) = (best_e1rm, s_best_e1rm)
                && cur > prev
            {
                let d = round1(cur - prev);
                session_prs.push("e1RM PR".to_string());
                prs.push(PrEvent {
                    date: date.clone(),
                    workout_id: workout_id.clone(),
                    workout_title: workout_title.clone(),
                    template_id: template_id.to_string(),
                    exercise_title: title.clone(),
                    kind: "e1RM".to_string(),
                    value_label: format!("{cur:.1} kg"),
                    delta_label: format!("+{d:.1} kg"),
                });
            }
            if let (Some(prev), Some(cur)) = (best_weight, s_top_weight)
                && cur > prev
            {
                let d = round1(cur - prev);
                session_prs.push("Weight PR".to_string());
                prs.push(PrEvent {
                    date: date.clone(),
                    workout_id: workout_id.clone(),
                    workout_title: workout_title.clone(),
                    template_id: template_id.to_string(),
                    exercise_title: title.clone(),
                    kind: "Weight".to_string(),
                    value_label: format!("{cur} kg"),
                    delta_label: format!("+{d} kg"),
                });
            }
            for (&g, &cur_reps) in &s_reps_by_w {
                if let Some(&prev_reps) = reps_at_weight.get(&g)
                    && cur_reps > prev_reps
                {
                    let w_kg = g as f64 / 1000.0;
                    let label = format!("Rep PR @ {w_kg} kg");
                    session_prs.push(label);
                    prs.push(PrEvent {
                        date: date.clone(),
                        workout_id: workout_id.clone(),
                        workout_title: workout_title.clone(),
                        template_id: template_id.to_string(),
                        exercise_title: title.clone(),
                        kind: "Rep PR".to_string(),
                        value_label: format!("{cur_reps} reps @ {w_kg} kg"),
                        delta_label: format!("+{} reps", cur_reps - prev_reps),
                    });
                }
            }
            if let (Some(prev), Some(cur)) = (best_set_volume, s_best_vol)
                && cur > prev
                && !session_prs.iter().any(|p| p.starts_with("e1RM") || p.starts_with("Rep PR"))
            {
                session_prs.push("Set Volume PR".to_string());
                prs.push(PrEvent {
                    date: date.clone(),
                    workout_id: workout_id.clone(),
                    workout_title: workout_title.clone(),
                    template_id: template_id.to_string(),
                    exercise_title: title.clone(),
                    kind: "Set Volume".to_string(),
                    value_label: format!("{} kg", cur.round()),
                    delta_label: format!("+{} kg", (cur - prev).round()),
                });
            }
        }

        if idx == 0 || !session_prs.is_empty() {
            last_pr_idx = idx;
        }

        if let Some(e) = s_best_e1rm {
            best_e1rm = Some(best_e1rm.map_or(e, |b| b.max(e)));
        }
        if let Some(w) = s_top_weight {
            best_weight = Some(best_weight.map_or(w, |b| b.max(w)));
        }
        if let Some(rp) = s_top_reps {
            best_reps = Some(best_reps.map_or(rp, |b| b.max(rp)));
        }
        if let Some(v) = s_best_vol {
            best_set_volume = Some(best_set_volume.map_or(v, |b| b.max(v)));
        }
        for (g, rp) in s_reps_by_w {
            reps_at_weight
                .entry(g)
                .and_modify(|m| *m = (*m).max(rp))
                .or_insert(rp);
        }

        history.push(ExerciseSessionPoint {
            workout_id,
            workout_title,
            date,
            hard_sets,
            warmup_sets,
            volume_kg: volume_kg.round(),
            top_weight_kg: s_top_weight,
            top_reps: s_top_reps,
            best_e1rm: s_best_e1rm,
            prs: session_prs,
            sets: set_items,
        });
    }

    let sessions = history.len();
    let last = history.last()?;
    let first_h = history.first()?;
    let last_date = chrono::NaiveDate::parse_from_str(&last.date, "%Y-%m-%d").unwrap_or(today);
    let days_ago = (today - last_date).num_days();
    let sessions_since_pr = sessions.saturating_sub(1 + last_pr_idx);

    let status = if !last.prs.is_empty() {
        "pr"
    } else if sessions >= 3 && sessions_since_pr >= 2 {
        "plateau"
    } else {
        "building"
    };

    let e1rm_delta = match (first_h.best_e1rm, last.best_e1rm) {
        (Some(f), Some(l)) if sessions >= 2 => Some(round1(l - f)),
        _ => None,
    };

    let plate_hint = match (equipment_key.as_deref(), last.top_weight_kg) {
        (Some(eq), Some(w)) => cfg.find_load(eq, w),
        _ => None,
    };
    let next_weight = match (equipment_key.as_deref(), last.top_weight_kg) {
        (Some(eq), Some(w)) => cfg.next_up(eq, w),
        _ => None,
    };
    let at_ceiling = equipment_key.is_some() && last.top_weight_kg.is_some() && next_weight.is_none();

    let summary = ExerciseSummary {
        template_id: template_id.to_string(),
        title,
        primary_muscle,
        secondary_muscles,
        equipment_key,
        sessions,
        total_hard_sets,
        last_date: last.date.clone(),
        days_ago,
        best_e1rm,
        best_weight_kg: best_weight,
        best_reps,
        latest_e1rm: last.best_e1rm,
        latest_weight_kg: last.top_weight_kg,
        latest_top_reps: last.top_reps,
        e1rm_delta,
        sessions_since_pr,
        status,
        at_ceiling,
        next_weight_kg: next_weight.as_ref().map(|l| l.total_kg),
    };

    Some(AnalyzedExercise {
        summary,
        best_set_volume: best_set_volume.map(|v| v.round()),
        plate_hint,
        next_weight,
        history,
        prs,
    })
}

pub fn list(rows: &[SetRow], templates: &TemplateMap, cfg: &plates::Config) -> ExercisesOverview {
    let today = Local::now().date_naive();
    let mut by_tpl: HashMap<&str, Vec<&SetRow>> = HashMap::new();
    for r in rows {
        by_tpl.entry(&r.template_id).or_default().push(r);
    }

    let mut exercises = Vec::with_capacity(by_tpl.len());
    let mut pr_feed = Vec::new();
    for (tpl_id, t_rows) in by_tpl {
        if let Some(a) = analyze_one(tpl_id, &t_rows, templates, cfg, today) {
            exercises.push(a.summary);
            pr_feed.extend(a.prs);
        }
    }

    exercises.sort_by(|a, b| {
        b.sessions
            .cmp(&a.sessions)
            .then(b.last_date.cmp(&a.last_date))
            .then(a.title.cmp(&b.title))
    });
    pr_feed.sort_by(|a, b| b.date.cmp(&a.date).then(a.exercise_title.cmp(&b.exercise_title)));
    pr_feed.truncate(30);

    ExercisesOverview { exercises, pr_feed }
}

pub fn detail(
    template_id: &str,
    rows: &[SetRow],
    templates: &TemplateMap,
    cfg: &plates::Config,
) -> Option<ExerciseDetail> {
    let today = Local::now().date_naive();
    let t_rows: Vec<&SetRow> = rows.iter().filter(|r| r.template_id == template_id).collect();
    let a = analyze_one(template_id, &t_rows, templates, cfg, today)?;
    Some(ExerciseDetail {
        template_id: a.summary.template_id,
        title: a.summary.title,
        primary_muscle: a.summary.primary_muscle,
        secondary_muscles: a.summary.secondary_muscles,
        equipment_key: a.summary.equipment_key,
        sessions: a.summary.sessions,
        total_hard_sets: a.summary.total_hard_sets,
        best_e1rm: a.summary.best_e1rm,
        best_weight_kg: a.summary.best_weight_kg,
        best_reps: a.summary.best_reps,
        best_set_volume: a.best_set_volume,
        sessions_since_pr: a.summary.sessions_since_pr,
        status: a.summary.status,
        plate_hint: a.plate_hint,
        next_weight: a.next_weight,
        at_ceiling: a.summary.at_ceiling,
        history: a.history,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(wid: &str, ts: &str, w: f64, reps: i64) -> SetRow {
        SetRow {
            workout_id: wid.into(),
            workout_title: "Push".into(),
            start_time: ts.into(),
            end_time: ts.into(),
            template_id: "07B38369".into(),
            exercise_title: "Incline Bench Press (Dumbbell)".into(),
            set_type: "normal".into(),
            weight_kg: Some(w),
            reps: Some(reps),
            primary_muscle: Some("chest".into()),
            secondary: vec!["triceps".into()],
            equipment: Some("dumbbell".into()),
        }
    }

    #[test]
    fn detects_rep_pr_and_plateau() {
        let cfg = plates::Config::load(concat!(env!("CARGO_MANIFEST_DIR"), "/../equipment.toml")).unwrap();
        let templates = TemplateMap::new();
        let rows = vec![
            row("w1", "2026-10-26T10:00:00Z", 8.0, 8),
            row("w2", "2026-11-08T10:00:00Z", 8.0, 12), // PR
            row("w3", "2026-11-12T10:00:00Z", 8.0, 12), // stall 1
            row("w4", "2026-11-20T10:00:00Z", 8.0, 10), // stall 2 -> plateau
        ];
        let ov = list(&rows, &templates, &cfg);
        assert_eq!(ov.exercises.len(), 1);
        let ex = &ov.exercises[0];
        assert_eq!(ex.status, "plateau");
        assert_eq!(ex.sessions_since_pr, 2);
        assert_eq!(ex.best_e1rm, Some(11.2));
        assert!(ov.pr_feed.iter().any(|p| p.kind == "Rep PR" && p.delta_label == "+4 reps"));
    }
}
