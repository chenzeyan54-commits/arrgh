//! Royal Road metadata authority (ADR 0034, spec 019) — English-original
//! web novels, which NovelUpdates/WuxiaWorld don't catalog. Proxied through
//! the Royal Road plugin on plugin-host, the same bundle that serves it as a
//! chapter Source — one HTML parser, not a Rust twin (mirrors
//! `novelupdates.rs`).

use serde::Deserialize;

#[derive(Clone, Debug, PartialEq)]
pub struct RoyalRoadSeries {
    pub source_id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub status: String,
    pub tags: Option<String>,
}

#[derive(Deserialize)]
struct PluginSearchResult {
    id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    cover_url: Option<String>,
    status: Option<String>,
    tags: Option<String>,
}

/// Fiction-page metadata — only `author` is missing from search results.
#[derive(Deserialize, Debug, PartialEq)]
pub struct RoyalRoadMeta {
    pub description: Option<String>,
    pub author: Option<String>,
    pub tags: Option<String>,
}

fn base(plugin_host_url: &str) -> String {
    format!("{}/royalroad", plugin_host_url.trim_end_matches('/'))
}

pub async fn search(
    http: &reqwest::Client,
    plugin_host_url: &str,
    q: &str,
) -> anyhow::Result<Vec<RoyalRoadSeries>> {
    let url = format!(
        "{}/search?q={}",
        base(plugin_host_url),
        urlencoding::encode(q)
    );
    let results: Vec<PluginSearchResult> = http
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(results.into_iter().filter_map(to_series).collect())
}

/// Drops results without an id or title; missing status → `"unknown"`.
fn to_series(r: PluginSearchResult) -> Option<RoyalRoadSeries> {
    Some(RoyalRoadSeries {
        source_id: r.id.filter(|s| !s.is_empty())?,
        title: r.title.filter(|s| !s.is_empty())?,
        description: r.description,
        cover_url: r.cover_url,
        status: r.status.unwrap_or_else(|| "unknown".to_string()),
        tags: r.tags,
    })
}

pub async fn meta(
    http: &reqwest::Client,
    plugin_host_url: &str,
    fiction_id: &str,
) -> anyhow::Result<RoyalRoadMeta> {
    let url = format!(
        "{}/manga/{}/meta",
        base(plugin_host_url),
        urlencoding::encode(fiction_id)
    );
    Ok(http
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(id: Option<&str>, title: Option<&str>, status: Option<&str>) -> PluginSearchResult {
        PluginSearchResult {
            id: id.map(String::from),
            title: title.map(String::from),
            description: Some("desc".into()),
            cover_url: Some("https://www.royalroadcdn.com/c.jpg".into()),
            status: status.map(String::from),
            tags: Some("LitRPG".into()),
        }
    }

    #[test]
    fn maps_full_result_passing_fields_through() {
        let s = to_series(raw(
            Some("36049"),
            Some("The Primal Hunter"),
            Some("ongoing"),
        ))
        .unwrap();
        assert_eq!(
            s,
            RoyalRoadSeries {
                source_id: "36049".into(),
                title: "The Primal Hunter".into(),
                description: Some("desc".into()),
                cover_url: Some("https://www.royalroadcdn.com/c.jpg".into()),
                status: "ongoing".into(),
                tags: Some("LitRPG".into()),
            }
        );
    }

    #[test]
    fn drops_missing_or_empty_id_or_title() {
        assert_eq!(to_series(raw(None, Some("T"), None)), None);
        assert_eq!(to_series(raw(Some(""), Some("T"), None)), None);
        assert_eq!(to_series(raw(Some("1"), None, None)), None);
        assert_eq!(to_series(raw(Some("1"), Some(""), None)), None);
    }

    #[test]
    fn missing_status_defaults_to_unknown() {
        assert_eq!(
            to_series(raw(Some("1"), Some("T"), None)).unwrap().status,
            "unknown"
        );
    }
}
