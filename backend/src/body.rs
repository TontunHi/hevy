//! Body measurements + relative strength (e1RM / bodyweight).

use crate::exercises::ExerciseSummary;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize)]
pub struct RelativeLift {
    pub template_id: String,
    pub title: String,
    pub primary_muscle: Option<String>,
    pub best_e1rm: f64,
    pub ratio: f64,
    pub latest_weight_kg: Option<f64>,
    pub latest_top_reps: Option<i64>,
}

#[derive(Serialize)]
pub struct BodyOverview {
    pub latest_weight_kg: Option<f64>,
    pub weight_delta_kg: Option<f64>,
    pub latest_date: Option<String>,
    pub measurements: Vec<Value>,
    pub relative_strength: Vec<RelativeLift>,
}

#[derive(Deserialize)]
pub struct LogMeasurement {
    pub date: String,
    pub weight_kg: Option<f64>,
    pub fat_percent: Option<f64>,
    pub lean_mass_kg: Option<f64>,
    pub waist: Option<f64>,
}

impl LogMeasurement {
    pub fn to_hevy_payload(&self) -> anyhow::Result<Value> {
        chrono::NaiveDate::parse_from_str(&self.date, "%Y-%m-%d")
            .map_err(|_| anyhow::anyhow!("date must be YYYY-MM-DD"))?;
        let mut map = serde_json::Map::new();
        map.insert("date".into(), Value::String(self.date.clone()));
        let mut any_field = false;
        for (k, v) in [
            ("weight_kg", self.weight_kg),
            ("fat_percent", self.fat_percent),
            ("lean_mass_kg", self.lean_mass_kg),
            ("waist", self.waist),
        ] {
            if let Some(n) = v {
                anyhow::ensure!(n.is_finite() && n > 0.0, "{k} must be positive");
                map.insert(k.into(), Value::from(n));
                any_field = true;
            }
        }
        anyhow::ensure!(any_field, "provide at least one measurement field");
        Ok(Value::Object(map))
    }
}

pub fn overview(measurements: Vec<Value>, exercises: &[ExerciseSummary]) -> BodyOverview {
    let weights: Vec<f64> = measurements
        .iter()
        .filter_map(|m| m["weight_kg"].as_f64())
        .collect();
    let latest_weight_kg = weights.first().copied();
    let weight_delta_kg = match (weights.first(), weights.get(1)) {
        (Some(cur), Some(prev)) => Some(((cur - prev) * 10.0).round() / 10.0),
        _ => None,
    };
    let latest_date = measurements
        .first()
        .and_then(|m| m["date"].as_str())
        .map(str::to_string);

    let relative_strength = match latest_weight_kg {
        Some(bw) if bw > 0.0 => {
            let mut lifts: Vec<RelativeLift> = exercises
                .iter()
                .filter_map(|ex| {
                    let e1rm = ex.best_e1rm?;
                    Some(RelativeLift {
                        template_id: ex.template_id.clone(),
                        title: ex.title.clone(),
                        primary_muscle: ex.primary_muscle.clone(),
                        best_e1rm: e1rm,
                        ratio: ((e1rm / bw) * 100.0).round() / 100.0,
                        latest_weight_kg: ex.latest_weight_kg,
                        latest_top_reps: ex.latest_top_reps,
                    })
                })
                .collect();
            lifts.sort_by(|a, b| b.ratio.total_cmp(&a.ratio));
            lifts.truncate(10);
            lifts
        }
        _ => vec![],
    };

    BodyOverview {
        latest_weight_kg,
        weight_delta_kg,
        latest_date,
        measurements,
        relative_strength,
    }
}
