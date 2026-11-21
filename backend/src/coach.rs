//! Plate-aware hypertrophy progression coach + Hevy routine export.

use crate::db::{SetRow, TemplateMap};
use crate::metrics::is_hard;
use crate::muscles;
use crate::plates::{self, Load};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Serialize, Clone)]
pub struct PrescribedSet {
    pub set_type: String,
    pub weight_kg: Option<f64>,
    pub reps: i64,
}

#[derive(Serialize, Clone)]
pub struct CoachExercisePlan {
    pub template_id: String,
    pub title: String,
    pub primary_muscle: Option<String>,
    pub equipment_key: Option<String>,
    pub action: &'static str,
    pub reason: String,
    pub last_date: String,
    pub last_summary: String,
    pub target_weight_kg: Option<f64>,
    pub target_reps: i64,
    pub working_sets: usize,
    pub plate_load: Option<Load>,
    pub next_load: Option<Load>,
    pub at_ceiling: bool,
    pub rest_seconds: i64,
    pub sets: Vec<PrescribedSet>,
}

#[derive(Serialize, Clone)]
pub struct MuscleGap {
    pub muscle: String,
    pub weekly_rate: f64,
    pub suggestion: String,
}

#[derive(Serialize, Clone)]
pub struct SplitPlan {
    pub split: String,
    pub days_ago: i64,
    pub last_date: String,
    pub routine_title: String,
    pub notes: String,
    pub exercises: Vec<CoachExercisePlan>,
    pub muscle_gaps: Vec<MuscleGap>,
}

#[derive(Serialize)]
pub struct CoachOverview {
    pub recommended_split: Option<String>,
    pub splits: Vec<SplitPlan>,
}

#[derive(Deserialize)]
pub struct PushRoutineRequest {
    pub routine_title: Option<String>,
    pub notes: Option<String>,
    pub exercises: Option<Vec<PushExerciseOverride>>,
}

#[derive(Deserialize)]
pub struct PushExerciseOverride {
    pub template_id: String,
    pub weight_kg: Option<f64>,
    pub reps: i64,
    pub working_sets: usize,
    pub rest_seconds: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct PushRoutineResult {
    pub action: &'static str,
    pub routine_id: Option<String>,
    pub routine_title: String,
    pub folder_id: Option<i64>,
    pub folder_title: String,
    pub exercise_count: usize,
}

fn local_date(ts: &str) -> Option<chrono::NaiveDate> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|t| t.with_timezone(&Local).date_naive())
}

fn format_plates(load: &Load) -> String {
    if load.per_stack.is_empty() {
        return "empty bar".into();
    }
    let list: Vec<String> = load.per_stack.iter().map(|p| format!("{p}")).collect();
    format!("{} kg/side", list.join(" + "))
}

fn build_sets(
    warmup_count: usize,
    working_sets: usize,
    weight_kg: Option<f64>,
    reps: i64,
) -> Vec<PrescribedSet> {
    let mut out = Vec::with_capacity(warmup_count + working_sets);
    for _ in 0..warmup_count {
        out.push(PrescribedSet {
            set_type: "warmup".into(),
            weight_kg,
            reps: (reps.min(10)).max(6),
        });
    }
    for _ in 0..working_sets.max(1) {
        out.push(PrescribedSet {
            set_type: "normal".into(),
            weight_kg,
            reps,
        });
    }
    out
}

fn prescribe_exercise(
    template_id: &str,
    last_rows: &[&SetRow],
    templates: &TemplateMap,
    cfg: &plates::Config,
    today: chrono::NaiveDate,
) -> CoachExercisePlan {
    let first = last_rows[0];
    let tpl = templates.get(template_id);
    let title = tpl.map(|t| t.title.clone()).unwrap_or_else(|| first.exercise_title.clone());
    let primary_muscle = tpl
        .map(|t| t.primary_muscle_group.clone())
        .or_else(|| first.primary_muscle.clone());
    let hevy_eq = tpl
        .and_then(|t| t.equipment.as_deref())
        .or(first.equipment.as_deref());
    let equipment_key = cfg.equipment_for(template_id, hevy_eq).map(str::to_string);
    let last_date = local_date(&first.start_time).unwrap_or(today).to_string();

    let warmups: Vec<&&SetRow> = last_rows.iter().filter(|r| !is_hard(r)).collect();
    let working: Vec<&&SetRow> = last_rows.iter().filter(|r| is_hard(r)).collect();
    let working_count = working.len().max(1);

    let last_summary = if working.is_empty() {
        "No working sets".into()
    } else {
        working
            .iter()
            .map(|r| match r.weight_kg {
                Some(w) if w > 0.0 => format!("{w}×{}", r.reps.unwrap_or(0)),
                _ => format!("BW×{}", r.reps.unwrap_or(0)),
            })
            .collect::<Vec<_>>()
            .join(", ")
    };

    let top_weight = working.iter().filter_map(|r| r.weight_kg).fold(None, |acc: Option<f64>, w| {
        Some(acc.map_or(w, |a| a.max(w)))
    });
    let reps_vals: Vec<i64> = working.iter().filter_map(|r| r.reps).collect();
    let min_reps = reps_vals.iter().copied().min().unwrap_or(8);
    let max_reps = reps_vals.iter().copied().max().unwrap_or(min_reps);

    // Weighted progression with plate-inventory constraints.
    if let Some(cur_w) = top_weight.filter(|&w| w > 0.0) {
        let cur_load = equipment_key
            .as_deref()
            .and_then(|eq| cfg.find_load(eq, cur_w));
        let next_load = equipment_key
            .as_deref()
            .and_then(|eq| cfg.next_up(eq, cur_w));
        let at_ceiling = equipment_key.is_some() && next_load.is_none();

        let ready_to_step = min_reps >= 12 || (min_reps >= 10 && max_reps >= 15);
        if ready_to_step {
            if let Some(next) = next_load {
                let next_kg = next.total_kg;
                let target_reps = 8;
                let plates_txt = format_plates(&next);
                let reps_span = if min_reps == max_reps {
                    format!("{min_reps}")
                } else {
                    format!("{min_reps}–{max_reps}")
                };
                return CoachExercisePlan {
                    template_id: template_id.to_string(),
                    title,
                    primary_muscle,
                    equipment_key,
                    action: "increase_weight",
                    reason: format!(
                        "Hit {reps_span} reps @ {cur_w} kg. Load {next_kg} kg ({plates_txt}) and rebuild from {target_reps} reps.",
                    ),
                    last_date,
                    last_summary,
                    target_weight_kg: Some(next_kg),
                    target_reps,
                    working_sets: working_count,
                    plate_load: Some(next.clone()),
                    next_load: Some(next),
                    at_ceiling: false,
                    rest_seconds: 120,
                    sets: build_sets(warmups.len(), working_count, Some(next_kg), target_reps),
                };
            }

            // At hardware plate ceiling: progress via reps, set count, or unilateral switch.
            let target_reps = (max_reps + 2).min(20);
            return CoachExercisePlan {
                template_id: template_id.to_string(),
                title,
                primary_muscle,
                equipment_key,
                action: "ceiling_switch",
                reason: format!(
                    "At {cur_w} kg plate ceiling. Push to {target_reps} reps with 3-1-1 tempo, or switch to a one-arm variant (unlocks up to 24 kg)."
                ),
                last_date,
                last_summary,
                target_weight_kg: Some(cur_w),
                target_reps,
                working_sets: working_count,
                plate_load: cur_load,
                next_load: None,
                at_ceiling: true,
                rest_seconds: 90,
                sets: build_sets(warmups.len(), working_count, Some(cur_w), target_reps),
            };
        }

        let target_reps = (min_reps + 1).max(8).min(15);
        let plate_txt = cur_load
            .as_ref()
            .map(format_plates)
            .unwrap_or_else(|| format!("{cur_w} kg"));
        return CoachExercisePlan {
            template_id: template_id.to_string(),
            title,
            primary_muscle,
            equipment_key,
            action: "add_reps",
            reason: format!(
                "Hold {cur_w} kg ({plate_txt}). Aim for {target_reps}+ reps across all {working_count} sets before adding weight."
            ),
            last_date,
            last_summary,
            target_weight_kg: Some(cur_w),
            target_reps,
            working_sets: working_count,
            plate_load: cur_load,
            next_load,
            at_ceiling,
            rest_seconds: 90,
            sets: build_sets(warmups.len(), working_count, Some(cur_w), target_reps),
        };
    }

    // Bodyweight exercise.
    let target_reps = (min_reps + 2).min(25);
    CoachExercisePlan {
        template_id: template_id.to_string(),
        title,
        primary_muscle,
        equipment_key,
        action: "bodyweight_reps",
        reason: format!("Bodyweight: aim for {target_reps} controlled reps per set."),
        last_date,
        last_summary,
        target_weight_kg: None,
        target_reps,
        working_sets: working_count,
        plate_load: None,
        next_load: None,
        at_ceiling: false,
        rest_seconds: 90,
        sets: build_sets(warmups.len(), working_count, None, target_reps),
    }
}

fn split_muscles(split: &str) -> &'static [&'static str] {
    match split.to_lowercase().as_str() {
        "push" => &["chest", "shoulders", "triceps"],
        "pull" => &["lats", "upper_back", "traps", "biceps", "forearms"],
        "legs" | "lower" => &["quadriceps", "hamstrings", "glutes", "calves", "adductors"],
        "upper" => &["chest", "shoulders", "triceps", "lats", "upper_back", "biceps"],
        _ => &[],
    }
}

fn suggestion_for(muscle: &str) -> &'static str {
    match muscle {
        "lats" => "Lat Pulldown (Cable) or One-Arm Dumbbell Row (+3 sets)",
        "upper_back" => "Bent Over Row (Dumbbell) or Rear Delt Fly (+3 sets)",
        "traps" => "Shrug (Dumbbell) or Barbell Shrug (+3 sets)",
        "biceps" => "Preacher Curl (Barbell) or Hammer Curl (+3 sets)",
        "chest" => "Incline Bench Press (Dumbbell) (+3 sets)",
        "shoulders" => "Lateral Raise (Dumbbell) (+3 sets)",
        "triceps" => "Skullcrusher (Barbell) or Triceps Extension (+3 sets)",
        "quadriceps" => "Goblet Squat or Split Squat (Dumbbell) (+3 sets)",
        "hamstrings" => "Romanian Deadlift (Dumbbell or Barbell) (+3 sets)",
        "glutes" => "Romanian Deadlift or Glute Bridge (+3 sets)",
        "calves" => "Standing Calf Raise (Dumbbell) (+3 sets)",
        _ => "Add 2–3 working sets for this muscle",
    }
}

pub fn build_all(
    rows: &[SetRow],
    templates: &TemplateMap,
    cfg: &plates::Config,
) -> CoachOverview {
    let today = Local::now().date_naive();
    let muscle_rep = muscles::report(rows, 7);
    let muscle_rates: HashMap<&str, f64> = muscle_rep
        .muscles
        .iter()
        .map(|m| (m.muscle.as_str(), m.weekly_rate))
        .collect();

    // Latest rows per exercise template (regardless of split, so weights stay current).
    let mut latest_by_ex: HashMap<&str, (&str, Vec<&SetRow>)> = HashMap::new();
    // Group rows by (start_time, workout_id, template_id).
    let mut ex_sessions: BTreeMap<(&str, &str, &str), Vec<&SetRow>> = BTreeMap::new();
    for r in rows {
        ex_sessions
            .entry((&r.start_time, &r.workout_id, &r.template_id))
            .or_default()
            .push(r);
    }
    for ((start_ts, wid, tpl_id), s_rows) in ex_sessions {
        latest_by_ex.insert(tpl_id, (wid, s_rows));
        let _ = start_ts;
    }

    // Latest workout per split title.
    let mut split_workouts: BTreeMap<&str, (&str, &str, Vec<&str>)> = BTreeMap::new();
    let mut seen_ex_in_w: HashMap<&str, BTreeSet<&str>> = HashMap::new();
    for r in rows {
        let entry = split_workouts
            .entry(&r.workout_title)
            .or_insert((&r.workout_id, &r.start_time, vec![]));
        if entry.0 != r.workout_id && r.start_time.as_str() > entry.1 {
            *entry = (&r.workout_id, &r.start_time, vec![]);
            seen_ex_in_w.remove(r.workout_id.as_str());
        }
        if entry.0 == r.workout_id {
            let set = seen_ex_in_w.entry(&r.workout_id).or_default();
            if set.insert(&r.template_id) {
                entry.2.push(&r.template_id);
            }
        }
    }

    let mut splits: Vec<SplitPlan> = split_workouts
        .into_iter()
        .map(|(split, (_wid, start_ts, ex_ids))| {
            let last_d = local_date(start_ts).unwrap_or(today);
            let days_ago = (today - last_d).num_days();
            let exercises: Vec<CoachExercisePlan> = ex_ids
                .into_iter()
                .filter_map(|tpl_id| {
                    let (_, s_rows) = latest_by_ex.get(tpl_id)?;
                    Some(prescribe_exercise(tpl_id, s_rows, templates, cfg, today))
                })
                .collect();

            let mut muscle_gaps: Vec<MuscleGap> = split_muscles(split)
                .iter()
                .filter_map(|&m| {
                    let rate = muscle_rates.get(m).copied().unwrap_or(0.0);
                    if rate < 10.0 {
                        Some(MuscleGap {
                            muscle: m.to_string(),
                            weekly_rate: rate,
                            suggestion: suggestion_for(m).to_string(),
                        })
                    } else {
                        None
                    }
                })
                .collect();
            muscle_gaps.sort_by(|a, b| a.weekly_rate.total_cmp(&b.weekly_rate));

            let step_ups = exercises.iter().filter(|e| e.action == "increase_weight").count();
            let notes = format!(
                "Generated by Hevy Ledger (plate-aware coach). {step_ups} load step-up(s) prescribed."
            );

            SplitPlan {
                split: split.to_string(),
                days_ago,
                last_date: last_d.to_string(),
                routine_title: format!("Coach: {split}"),
                notes,
                exercises,
                muscle_gaps,
            }
        })
        .collect();

    splits.sort_by(|a, b| b.days_ago.cmp(&a.days_ago).then(a.split.cmp(&b.split)));
    let recommended_split = splits.first().map(|s| s.split.clone());

    CoachOverview {
        recommended_split,
        splits,
    }
}

pub fn to_hevy_routine_payload(
    plan: &SplitPlan,
    req: &PushRoutineRequest,
    folder_id: Option<i64>,
    is_update: bool,
) -> Value {
    let title = req
        .routine_title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&plan.routine_title);
    let notes = req.notes.as_deref().unwrap_or(&plan.notes);

    let exercises: Vec<Value> = if let Some(overrides) = &req.exercises {
        overrides
            .iter()
            .map(|o| {
                let sets: Vec<Value> = (0..o.working_sets.max(1))
                    .map(|_| {
                        json!({
                            "type": "normal",
                            "weight_kg": o.weight_kg,
                            "reps": o.reps,
                            "distance_meters": null,
                            "duration_seconds": null,
                            "custom_metric": null,
                        })
                    })
                    .collect();
                json!({
                    "exercise_template_id": o.template_id,
                    "superset_id": null,
                    "rest_seconds": o.rest_seconds.unwrap_or(90),
                    "notes": o.notes,
                    "sets": sets,
                })
            })
            .collect()
    } else {
        plan.exercises
            .iter()
            .map(|e| {
                let sets: Vec<Value> = e
                    .sets
                    .iter()
                    .map(|s| {
                        json!({
                            "type": s.set_type,
                            "weight_kg": s.weight_kg,
                            "reps": s.reps,
                            "distance_meters": null,
                            "duration_seconds": null,
                            "custom_metric": null,
                        })
                    })
                    .collect();
                json!({
                    "exercise_template_id": e.template_id,
                    "superset_id": null,
                    "rest_seconds": e.rest_seconds,
                    "notes": e.reason,
                    "sets": sets,
                })
            })
            .collect()
    };

    if is_update {
        json!({
            "title": title,
            "notes": notes,
            "exercises": exercises,
        })
    } else {
        json!({
            "title": title,
            "folder_id": folder_id,
            "notes": notes,
            "exercises": exercises,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_row(wid: &str, title: &str, tpl: &str, eq: &str, w: f64, reps: i64) -> SetRow {
        SetRow {
            workout_id: wid.into(),
            workout_title: title.into(),
            start_time: "2026-11-20T10:00:00Z".into(),
            end_time: "2026-11-20T10:50:00Z".into(),
            template_id: tpl.into(),
            exercise_title: "Bench Press (Dumbbell)".into(),
            set_type: "normal".into(),
            weight_kg: Some(w),
            reps: Some(reps),
            primary_muscle: Some("chest".into()),
            secondary: vec!["triceps".into()],
            equipment: Some(eq.into()),
        }
    }

    #[test]
    fn prescribes_plate_valid_step_up_and_ceiling() {
        let cfg = plates::Config::load(concat!(env!("CARGO_MANIFEST_DIR"), "/../equipment.toml")).unwrap();
        let templates = TemplateMap::new();

        // 8 kg x 12 -> should step up to 9 kg (next loadable dumbbell weight)
        let rows = vec![
            set_row("w1", "Push", "3601968B", "dumbbell", 8.0, 12),
            set_row("w1", "Push", "3601968B", "dumbbell", 8.0, 12),
        ];
        let ov = build_all(&rows, &templates, &cfg);
        assert_eq!(ov.recommended_split.as_deref(), Some("Push"));
        let ex = &ov.splits[0].exercises[0];
        assert_eq!(ex.action, "increase_weight");
        assert_eq!(ex.target_weight_kg, Some(9.0));
        assert_eq!(ex.target_reps, 8);

        // 12 kg x 12 on dumbbell_pair -> at ceiling!
        let rows_max = vec![set_row("w2", "Push", "3601968B", "dumbbell", 12.0, 12)];
        let ov_max = build_all(&rows_max, &templates, &cfg);
        let ex_max = &ov_max.splits[0].exercises[0];
        assert_eq!(ex_max.action, "ceiling_switch");
        assert!(ex_max.at_ceiling);
    }
}
