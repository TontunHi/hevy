//! Thin client for https://api.hevyapp.com/v1

use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const BASE: &str = "https://api.hevyapp.com/v1";

#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    key: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Workout {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: String,
    pub updated_at: String,
    pub routine_id: Option<String>,
    pub exercises: Vec<Exercise>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Exercise {
    pub index: i64,
    pub title: String,
    pub exercise_template_id: String,
    pub sets: Vec<Set>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Set {
    pub index: i64,
    #[serde(rename = "type")]
    pub set_type: String,
    pub weight_kg: Option<f64>,
    pub reps: Option<i64>,
    pub distance_meters: Option<f64>,
    pub duration_seconds: Option<i64>,
    pub rpe: Option<f64>,
}

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Event {
    Updated { workout: Box<Workout> },
    Deleted { id: String },
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Template {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub primary_muscle_group: String,
    #[serde(default)]
    pub secondary_muscle_groups: Vec<String>,
    pub equipment: Option<String>,
    pub is_custom: bool,
}

impl Client {
    pub fn new(key: String) -> Self {
        Self { http: reqwest::Client::new(), key }
    }

    async fn get<T: DeserializeOwned>(&self, path: &str, query: &[(&str, String)]) -> Result<T> {
        let res = self
            .http
            .get(format!("{BASE}{path}"))
            .header("api-key", &self.key)
            .query(query)
            .send()
            .await?;
        let status = res.status();
        let body = res.text().await?;
        anyhow::ensure!(status.is_success(), "GET {path} -> {status}: {body}");
        serde_json::from_str(&body).with_context(|| format!("parsing {path}"))
    }

    /// Fetch every page of a paginated endpoint; `field` is the array key in the response.
    async fn all_pages<T: DeserializeOwned>(
        &self,
        path: &str,
        field: &str,
        page_size: u32,
        extra: &[(&str, String)],
    ) -> Result<Vec<T>> {
        let mut out = Vec::new();
        let mut page = 1;
        loop {
            let mut q = vec![("page", page.to_string()), ("pageSize", page_size.to_string())];
            q.extend(extra.iter().cloned());
            let mut v: Value = self.get(path, &q).await?;
            let page_count = v["page_count"].as_u64().unwrap_or(1);
            out.extend(serde_json::from_value::<Vec<T>>(v[field].take())?);
            if page as u64 >= page_count {
                return Ok(out);
            }
            page += 1;
        }
    }

    pub async fn user(&self) -> Result<Value> {
        let v: Value = self.get("/user/info", &[]).await?;
        Ok(v["data"].clone())
    }

    /// Workout changes since `since` (RFC3339). Since epoch = full history.
    pub async fn workout_events(&self, since: &str) -> Result<Vec<Event>> {
        self.all_pages("/workouts/events", "events", 10, &[("since", since.to_string())]).await
    }

    pub async fn templates(&self) -> Result<Vec<Template>> {
        self.all_pages("/exercise_templates", "exercise_templates", 100, &[]).await
    }

    async fn send_json(&self, method: reqwest::Method, path: &str, body: &Value) -> Result<Value> {
        let res = self
            .http
            .request(method.clone(), format!("{BASE}{path}"))
            .header("api-key", &self.key)
            .json(body)
            .send()
            .await?;
        let status = res.status();
        let text = res.text().await?;
        anyhow::ensure!(status.is_success(), "{method} {path} -> {status}: {text}");
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
    }

    pub async fn measurements(&self) -> Result<Vec<Value>> {
        self.all_pages("/body_measurements", "body_measurements", 10, &[]).await
    }

    pub async fn upsert_measurement(&self, date: &str, payload: &Value, exists: bool) -> Result<Value> {
        if exists {
            self.send_json(reqwest::Method::PUT, &format!("/body_measurements/{date}"), payload).await
        } else {
            self.send_json(reqwest::Method::POST, "/body_measurements", payload).await
        }
    }

    pub async fn routine_folders(&self) -> Result<Vec<Value>> {
        self.all_pages("/routine_folders", "routine_folders", 10, &[]).await
    }

    pub async fn create_routine_folder(&self, title: &str) -> Result<Value> {
        let body = serde_json::json!({ "routine_folder": { "title": title } });
        let res = self.send_json(reqwest::Method::POST, "/routine_folders", &body).await?;
        Ok(res.get("routine_folder").cloned().unwrap_or(res))
    }

    pub async fn routines(&self) -> Result<Vec<Value>> {
        self.all_pages("/routines", "routines", 10, &[]).await
    }

    pub async fn create_routine(&self, routine: &Value) -> Result<Value> {
        let body = serde_json::json!({ "routine": routine });
        let res = self.send_json(reqwest::Method::POST, "/routines", &body).await?;
        Ok(res.get("routine").cloned().unwrap_or(res))
    }

    pub async fn update_routine(&self, id: &str, routine: &Value) -> Result<Value> {
        let body = serde_json::json!({ "routine": routine });
        let res = self.send_json(reqwest::Method::PUT, &format!("/routines/{id}"), &body).await?;
        Ok(res.get("routine").cloned().unwrap_or(res))
    }
}
