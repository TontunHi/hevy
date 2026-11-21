//! Derived stats for the dashboard. Data is small, so everything is computed in memory.

use crate::db::SetRow;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Muscles always shown, even at zero sets, so gaps are visible.
const MAJOR_MUSCLES: &[&str] = &[
    "chest", "shoulders", "triceps", "biceps", "lats", "upper_back", "traps",
    "quadriceps", "hamstrings", "glutes", "calves", "abdominals",
];

#[derive(Serialize, Default, Clone)]
pub struct WeekStats {
    pub week_start: String,
    pub workouts: usize,
    pub duration_min: f64,
    pub hard_sets: usize,
    pub volume_kg: f64,
}

#[derive(Serialize)]
pub struct DayStat {
    pub date: String,
    pub workouts: usize,
    pub hard_sets: usize,
}

#[derive(Serialize)]
pub struct SplitStat {
    pub title: String,
    pub sessions: usize,
    pub last_date: String,
    pub days_ago: i64,
}

#[derive(Serialize)]
pub struct MuscleStat {
    pub muscle: String,
    /// Primary = 1 set, secondary = 0.5 set.
    pub sets: f64,
}

#[derive(Serialize)]
pub struct WorkoutSummary {
    pub id: String,
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub duration_min: f64,
    pub exercises: usize,
    pub hard_sets: usize,
    pub warmup_sets: usize,
    pub volume_kg: f64,
}

#[derive(Serialize)]
pub struct Totals {
    pub workouts: usize,
    pub hard_sets: usize,
    pub duration_min: f64,
    pub volume_kg: f64,
    pub streak_weeks: usize,
}

#[derive(Serialize)]
pub struct Balance7d {
    pub push_sets: f64,
    pub pull_sets: f64,
    pub upper_sets: f64,
    pub lower_sets: f64,
}

#[derive(Serialize)]
pub struct Overview {
    pub this_week: WeekStats,
    pub last_week: WeekStats,
    pub totals: Totals,
    pub weekly: Vec<WeekStats>,
    pub days: Vec<DayStat>,
    pub splits: Vec<SplitStat>,
    pub muscles_7d: Vec<MuscleStat>,
    pub balance_7d: Balance7d,
    pub recent_workouts: Vec<WorkoutSummary>,
    pub bodyweight: Vec<(String, f64)>,
}

struct Session<'a> {
    id: &'a str,
    date: NaiveDate,
    start_time: &'a str,
    title: &'a str,
    duration_min: f64,
    sets: Vec<&'a SetRow>,
}

fn local(ts: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(ts).ok().map(|t| t.with_timezone(&Local))
}

fn monday(d: NaiveDate) -> NaiveDate {
    d - Duration::days(d.weekday().num_days_from_monday() as i64)
}

pub fn is_hard(s: &SetRow) -> bool {
    s.set_type != "warmup"
}

fn sessions(rows: &[SetRow]) -> Vec<Session<'_>> {
    let mut by_id: BTreeMap<&str, Session> = BTreeMap::new();
    for r in rows {
        let Some(start) = local(&r.start_time) else { continue };
        by_id
            .entry(&r.workout_id)
            .or_insert_with(|| Session {
                id: &r.workout_id,
                date: start.date_naive(),
                start_time: &r.start_time,
                title: &r.workout_title,
                duration_min: local(&r.end_time)
                    .map(|e| (e - start).num_seconds() as f64 / 60.0)
                    .unwrap_or(0.0),
                sets: vec![],
            })
            .sets
            .push(r);
    }
    let mut v: Vec<_> = by_id.into_values().collect();
    v.sort_by(|a, b| a.start_time.cmp(b.start_time));
    v
}

fn summarize(s: &Session) -> WorkoutSummary {
    let exercises: BTreeSet<&str> = s.sets.iter().map(|r| r.exercise_title.as_str()).collect();
    let hard_sets = s.sets.iter().filter(|r| is_hard(r)).count();
    let warmup_sets = s.sets.len() - hard_sets;
    let volume_kg: f64 = s
        .sets
        .iter()
        .filter(|r| is_hard(r))
        .map(|r| r.weight_kg.unwrap_or(0.0) * r.reps.unwrap_or(0) as f64)
        .sum::<f64>()
        .round();
    WorkoutSummary {
        id: s.id.to_string(),
        title: s.title.to_string(),
        date: s.date.to_string(),
        start_time: s.start_time.to_string(),
        duration_min: s.duration_min.round(),
        exercises: exercises.len(),
        hard_sets,
        warmup_sets,
        volume_kg,
    }
}

pub fn workout_summaries(rows: &[SetRow]) -> Vec<WorkoutSummary> {
    let ss = sessions(rows);
    ss.iter().rev().map(summarize).collect()
}

fn week_stats(week_start: NaiveDate, ss: &[&Session]) -> WeekStats {
    let hard: Vec<&&SetRow> = ss.iter().flat_map(|s| &s.sets).filter(|s| is_hard(s)).collect();
    WeekStats {
        week_start: week_start.to_string(),
        workouts: ss.len(),
        duration_min: ss.iter().map(|s| s.duration_min).sum::<f64>().round(),
        hard_sets: hard.len(),
        volume_kg: hard
            .iter()
            .map(|s| s.weight_kg.unwrap_or(0.0) * s.reps.unwrap_or(0) as f64)
            .sum::<f64>()
            .round(),
    }
}

/// Consecutive weeks (counting backwards from last completed week, or including this week if >= 2)
/// with at least 2 workouts.
fn streak_weeks(ss: &[Session], this_monday: NaiveDate) -> usize {
    let mut by_week: HashMap<NaiveDate, usize> = HashMap::new();
    for s in ss {
        *by_week.entry(monday(s.date)).or_default() += 1;
    }
    let mut streak = 0;
    let mut cursor = if by_week.get(&this_monday).copied().unwrap_or(0) >= 2 {
        this_monday
    } else {
        this_monday - Duration::weeks(1)
    };
    while by_week.get(&cursor).copied().unwrap_or(0) >= 2 {
        streak += 1;
        cursor -= Duration::weeks(1);
    }
    streak
}

pub fn overview(rows: &[SetRow], bodyweight: Vec<(String, Option<f64>)>, weeks: usize) -> Overview {
    let today = Local::now().date_naive();
    let this_monday = monday(today);
    let ss = sessions(rows);

    let weekly: Vec<WeekStats> = (0..weeks.max(2))
        .rev()
        .map(|i| {
            let start = this_monday - Duration::weeks(i as i64);
            let in_week: Vec<&Session> =
                ss.iter().filter(|s| monday(s.date) == start).collect();
            week_stats(start, &in_week)
        })
        .collect();

    let mut days: BTreeMap<NaiveDate, (usize, usize)> = BTreeMap::new();
    for s in &ss {
        let d = days.entry(s.date).or_default();
        d.0 += 1;
        d.1 += s.sets.iter().filter(|r| is_hard(r)).count();
    }

    let mut splits: BTreeMap<&str, (usize, NaiveDate)> = BTreeMap::new();
    for s in &ss {
        let e = splits.entry(s.title).or_insert((0, s.date));
        e.0 += 1;
        e.1 = e.1.max(s.date);
    }
    let mut splits: Vec<SplitStat> = splits
        .into_iter()
        .map(|(title, (sessions, last))| SplitStat {
            title: title.into(),
            sessions,
            last_date: last.to_string(),
            days_ago: (today - last).num_days(),
        })
        .collect();
    splits.sort_by_key(|s| std::cmp::Reverse(s.days_ago));

    let since = today - Duration::days(6);
    let mut muscles: HashMap<String, f64> =
        MAJOR_MUSCLES.iter().map(|m| (m.to_string(), 0.0)).collect();
    for s in ss.iter().filter(|s| s.date >= since) {
        for r in s.sets.iter().filter(|r| is_hard(r)) {
            if let Some(p) = &r.primary_muscle {
                *muscles.entry(p.clone()).or_default() += 1.0;
            }
            for m in &r.secondary {
                *muscles.entry(m.clone()).or_default() += 0.5;
            }
        }
    }

    let get_m = |k: &str| muscles.get(k).copied().unwrap_or(0.0);
    let balance_7d = Balance7d {
        push_sets: get_m("chest") + get_m("shoulders") + get_m("triceps"),
        pull_sets: get_m("lats") + get_m("upper_back") + get_m("traps") + get_m("biceps"),
        upper_sets: get_m("chest")
            + get_m("shoulders")
            + get_m("triceps")
            + get_m("biceps")
            + get_m("lats")
            + get_m("upper_back")
            + get_m("traps"),
        lower_sets: get_m("quadriceps") + get_m("hamstrings") + get_m("glutes") + get_m("calves"),
    };

    let mut muscles_7d: Vec<MuscleStat> =
        muscles.into_iter().map(|(muscle, sets)| MuscleStat { muscle, sets }).collect();
    muscles_7d.sort_by(|a, b| b.sets.total_cmp(&a.sets).then(a.muscle.cmp(&b.muscle)));

    let all_hard: Vec<&SetRow> =
        ss.iter().flat_map(|s| s.sets.iter().copied()).filter(|r| is_hard(r)).collect();
    let totals = Totals {
        workouts: ss.len(),
        hard_sets: all_hard.len(),
        duration_min: ss.iter().map(|s| s.duration_min).sum::<f64>().round(),
        volume_kg: all_hard
            .iter()
            .map(|s| s.weight_kg.unwrap_or(0.0) * s.reps.unwrap_or(0) as f64)
            .sum::<f64>()
            .round(),
        streak_weeks: streak_weeks(&ss, this_monday),
    };

    let recent_workouts: Vec<WorkoutSummary> = ss.iter().rev().take(5).map(summarize).collect();

    Overview {
        this_week: weekly[weekly.len() - 1].clone(),
        last_week: weekly[weekly.len() - 2].clone(),
        totals,
        weekly,
        days: days
            .into_iter()
            .map(|(d, (workouts, hard_sets))| DayStat { date: d.to_string(), workouts, hard_sets })
            .collect(),
        splits,
        muscles_7d,
        balance_7d,
        recent_workouts,
        bodyweight: bodyweight.into_iter().filter_map(|(d, w)| Some((d, w?))).collect(),
    }
}
