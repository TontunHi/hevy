//! Which weights can actually be loaded with the plates you own.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Deserialize, Serialize, Clone)]
pub struct Plate {
    pub kg: f64,
    pub count: u32,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Equipment {
    pub label: String,
    pub stacks: u32,
    pub counted: u32,
    pub base_kg: f64,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Config {
    pub plates: Vec<Plate>,
    pub equipment: BTreeMap<String, Equipment>,
    #[serde(default)]
    pub hevy_equipment: HashMap<String, String>,
    #[serde(default)]
    pub exercise_overrides: HashMap<String, String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Load {
    /// Weight as logged in Hevy.
    pub total_kg: f64,
    /// Plates on ONE stack (one side), heaviest first.
    pub per_stack: Vec<f64>,
}

impl Config {
    pub fn load(path: &str) -> anyhow::Result<Self> {
        Ok(toml::from_str(&std::fs::read_to_string(path)?)?)
    }

    pub fn normalize_and_validate(&mut self) -> anyhow::Result<()> {
        let mut merged: BTreeMap<i64, u32> = BTreeMap::new();
        for p in &self.plates {
            anyhow::ensure!(p.kg.is_finite() && p.kg > 0.0, "plate weight must be > 0");
            *merged.entry(g(p.kg)).or_default() += p.count;
        }
        self.plates = merged
            .into_iter()
            .rev()
            .filter(|(_, c)| *c > 0)
            .map(|(grams, count)| Plate { kg: kg(grams), count })
            .collect();
        anyhow::ensure!(self.plates.len() <= 12, "at most 12 distinct plate sizes supported");
        for (k, eq) in &self.equipment {
            anyhow::ensure!(eq.stacks >= 1 && eq.counted >= 1, "{k}: stacks and counted must be >= 1");
            anyhow::ensure!(eq.base_kg.is_finite() && eq.base_kg >= 0.0, "{k}: base_kg must be >= 0");
        }
        Ok(())
    }

    pub fn save(&self, path: &str) -> anyhow::Result<()> {
        let content = toml::to_string_pretty(self)?;
        std::fs::write(path, content)?;
        Ok(())
    }

    /// Equipment key used for an exercise (override first, then Hevy equipment type).
    pub fn equipment_for(&self, template_id: &str, hevy_equipment: Option<&str>) -> Option<&str> {
        self.exercise_overrides
            .get(template_id)
            .or_else(|| self.hevy_equipment.get(hevy_equipment?))
            .map(String::as_str)
    }

    /// Every distinct loadable weight for an equipment, lightest first.
    /// When several plate combos give the same weight, the one with fewest plates wins.
    pub fn loads(&self, equipment: &str) -> Vec<Load> {
        let Some(eq) = self.equipment.get(equipment) else { return vec![] };
        // Work in grams so 1.5 + 2.5 == 4.0 exactly.
        let sizes: Vec<(i64, u32)> = self
            .plates
            .iter()
            .map(|p| (g(p.kg), p.count / eq.stacks.max(1)))
            .collect();

        let mut best: BTreeMap<i64, Vec<i64>> = BTreeMap::new();
        let mut counts = vec![0u32; sizes.len()];
        loop {
            let stack: Vec<i64> = sizes
                .iter()
                .zip(&counts)
                .flat_map(|(&(w, _), &n)| std::iter::repeat_n(w, n as usize))
                .collect();
            let total = g(eq.base_kg) + eq.counted as i64 * stack.iter().sum::<i64>();
            if best.get(&total).is_none_or(|b| stack.len() < b.len()) {
                best.insert(total, stack);
            }
            // Odometer-style increment over all count combinations.
            let mut i = 0;
            while i < counts.len() && counts[i] == sizes[i].1 {
                counts[i] = 0;
                i += 1;
            }
            if i == counts.len() {
                break;
            }
            counts[i] += 1;
        }

        best.into_iter()
            .map(|(total, mut stack)| {
                stack.sort_unstable_by(|a, b| b.cmp(a));
                Load { total_kg: kg(total), per_stack: stack.into_iter().map(kg).collect() }
            })
            .collect()
    }

    /// Plate breakdown for an exact weight, if loadable on `equipment`.
    pub fn find_load(&self, equipment: &str, kg: f64) -> Option<Load> {
        self.loads(equipment).into_iter().find(|l| g(l.total_kg) == g(kg))
    }

    /// Lightest loadable weight strictly heavier than `current_kg`.
    pub fn next_up(&self, equipment: &str, current_kg: f64) -> Option<Load> {
        self.loads(equipment).into_iter().find(|l| g(l.total_kg) > g(current_kg))
    }
}

fn g(kg: f64) -> i64 {
    (kg * 1000.0).round() as i64
}
fn kg(g: i64) -> f64 {
    g as f64 / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> Config {
        Config::load(concat!(env!("CARGO_MANIFEST_DIR"), "/../equipment.toml")).unwrap()
    }
    fn totals(c: &Config, eq: &str) -> Vec<f64> {
        c.loads(eq).iter().map(|l| l.total_kg).collect()
    }

    #[test]
    fn dumbbell_pair_one_plate_per_size_per_side() {
        assert_eq!(totals(&cfg(), "dumbbell_pair"), [0.0, 3.0, 4.0, 5.0, 7.0, 8.0, 9.0, 12.0]);
    }

    #[test]
    fn logged_8kg_dumbbell_is_2_5_plus_1_5_per_side() {
        let c = cfg();
        let l = c.loads("dumbbell_pair").into_iter().find(|l| l.total_kg == 8.0).unwrap();
        assert_eq!(l.per_stack, [2.5, 1.5]);
    }

    #[test]
    fn barbell_includes_bar_and_tops_out_at_24_5() {
        let t = totals(&cfg(), "barbell");
        assert_eq!(t.first(), Some(&0.5));
        assert_eq!(t.last(), Some(&24.5));
    }

    #[test]
    fn lat_pulldown_16kg_and_next_step() {
        let c = cfg();
        assert!(totals(&c, "lat_pulldown").contains(&16.0));
        assert_eq!(c.next_up("lat_pulldown", 16.0).unwrap().total_kg, 17.0);
    }

    #[test]
    fn next_up_none_at_ceiling() {
        assert!(cfg().next_up("dumbbell_pair", 12.0).is_none());
    }

    #[test]
    fn normalize_merges_duplicates_and_sorts_desc() {
        let mut c = cfg();
        c.plates.push(Plate { kg: 2.5, count: 2 });
        c.plates.push(Plate { kg: 5.0, count: 2 });
        c.normalize_and_validate().unwrap();
        assert_eq!(c.plates[0].kg, 5.0);
        assert_eq!(c.plates[1].kg, 2.5);
        assert_eq!(c.plates[1].count, 6);
    }
}
