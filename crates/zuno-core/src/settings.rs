use crate::config::{ZunoPaths, atomic_write};
use crate::error::{Result, ZunoError};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const UI_ZOOM_MIN: f64 = 50.0;
pub const UI_ZOOM_MAX: f64 = 200.0;
pub const CROSSFADE_MAX_SECS: f32 = 10.0;
pub const EQ_BANDS_COUNT: usize = 10;
pub const EQ_MIN_DB: f32 = -12.0;
pub const EQ_MAX_DB: f32 = 12.0;
pub const LAST_PLAYED_MAX: usize = 30;
const MAX_BACKUPS_KEPT: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EqPresetSpec {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub category: String,
    pub bands: Vec<f32>,
    pub preamp: f32,
    #[serde(default)]
    pub custom: bool,
}

/// Built-in 10-band ISO studio EQ presets (`32 Hz .. 16 kHz`), mirrored 1:1 with the frontend.
pub fn builtin_eq_presets() -> Vec<EqPresetSpec> {
    let rows: &[(&str, &str, &str, &str, [f32; 10], f32)] = &[
        ("flat", "Flat", "Pure studio neutral", "reference", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], 0.0),
        ("studio", "Studio Reference", "Tight sub & crisp air", "reference", [1.5, 1.0, 0.0, -0.5, 0.0, 0.5, 1.5, 2.0, 1.5, 1.0], -0.5),
        ("late-night", "Late Night", "Warm low-volume comfort", "reference", [3.0, 2.0, 1.0, 0.0, -0.5, -1.0, -1.5, -2.5, -3.5, -4.0], 0.0),
        ("headphones", "Headphone Stage", "Natural stereo presence", "reference", [2.0, 1.5, 0.5, -1.0, 0.0, 1.0, 2.0, 1.5, 2.5, 2.0], -1.0),
        ("bass-boost", "Bass Boost", "Full punchy low-end", "bass", [6.0, 5.0, 3.5, 1.5, 0.0, 0.0, 0.5, 1.0, 1.5, 1.0], -2.5),
        ("deep-sub", "Deep Sub", "Focused sub-bass weight", "bass", [7.5, 5.5, 2.0, -0.5, -1.0, 0.0, 0.5, 1.0, 1.5, 2.0], -3.0),
        ("electronic", "Electronic", "Driving sub & bright synth", "bass", [5.0, 4.0, 1.5, -0.5, -1.5, 0.5, 1.5, 2.5, 4.0, 4.5], -2.5),
        ("hip-hop", "Hip-Hop", "Heavy kick & vocal snap", "bass", [5.5, 4.5, 2.0, 0.5, -1.0, -0.5, 1.5, 2.0, 2.5, 3.0], -2.5),
        ("vocal-boost", "Vocal Boost", "Forward intimate voices", "vocals", [-2.0, -1.5, -0.5, 1.0, 3.0, 4.5, 4.0, 2.5, 1.0, 0.0], -1.5),
        ("podcast", "Podcast & Speech", "Clear intelligible dialogue", "vocals", [-4.5, -3.5, -1.0, 1.0, 3.5, 5.0, 4.5, 2.0, -1.0, -2.5], -1.5),
        ("treble-air", "Treble Air", "Sparkle & micro-detail", "vocals", [-1.0, -0.5, 0.0, 0.0, 0.5, 1.5, 3.0, 4.5, 5.5, 6.0], -2.0),
        ("acoustic", "Acoustic", "Warm timber & strings", "genres", [1.5, 1.0, 0.5, 1.5, 2.0, 1.0, 1.5, 2.5, 2.0, 1.5], -1.0),
        ("rock", "Rock", "Crunchy guitars & snare", "genres", [4.0, 3.0, 1.5, -1.0, -1.5, 0.5, 2.5, 3.5, 3.5, 2.5], -2.0),
        ("jazz", "Jazz", "Upright bass & brass", "genres", [2.5, 2.0, 1.0, 1.5, -1.0, -1.0, 0.0, 1.5, 2.5, 3.0], -1.0),
        ("classical", "Classical", "Wide orchestral air", "genres", [2.0, 1.5, 0.5, 0.0, -0.5, -0.5, 0.0, 2.0, 3.0, 4.0], -1.5),
        ("lofi", "Lo-Fi Tape", "Soft analog warmth", "genres", [3.0, 2.5, 1.5, 1.0, 0.0, -1.0, -2.5, -4.0, -5.5, -6.5], -1.0),
    ];
    rows.iter()
        .map(|(id, name, tagline, category, bands, preamp)| EqPresetSpec {
            id: (*id).to_string(),
            name: (*name).to_string(),
            tagline: (*tagline).to_string(),
            category: (*category).to_string(),
            bands: bands.to_vec(),
            preamp: *preamp,
            custom: false,
        })
        .collect()
}

pub fn default_appearance_json() -> Value {
    serde_json::from_str(
        r#"{
            "theme": "zinc",
            "mode": "dark",
            "accent": "mono",
            "customColors": {},
            "fontFamily": "geist",
            "monoFont": "jetbrains",
            "customUiFont": "",
            "customMonoFont": "",
            "fontSize": "md",
            "radius": "balanced",
            "density": "comfortable",
            "borders": "subtle",
            "surfaceStyle": "bordered",
            "bgPattern": "clean",
            "themeTransition": "circle-blur",
            "themeTransitionStart": "trigger",
            "themeToggleStyle": "eclipse",
            "scrollProgressStyle": "skiper95",
            "scrollRevealStyle": "none",
            "navStyle": "sidebar",
            "windowRadius": "curved",
            "iconPack": "lucide",
            "iconStroke": "regular",
            "trackIconStyle": "ring",
            "playingStyle": "pulse",
            "playButtonStyle": "classic",
            "visualizerStyle": "orb",
            "visualizerColor": "theme",
            "visualizerIntensity": "balanced",
            "playerBarStyle": "floating",
            "scrubberKnob": "ring",
            "titlebarStyle": "minimal",
            "titlebarAlign": "right",
            "titlebarShowTrack": true,
            "titlebarCompact": false,
            "showLastPlayed": true,
            "showPlayPulse": true,
            "showTrackOverline": true,
            "showTrackDuration": true,
            "dockGradualBlur": true,
            "crossfadeSecs": 0,
            "uiZoom": 100
        }"#,
    )
    .expect("valid default appearance json")
}

pub fn default_eq_json() -> Value {
    json!({
        "enabled": false,
        "preamp": 0.0,
        "limiter": true,
        "presetId": "flat",
        "bands": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "customPresets": []
    })
}

pub fn default_sort_json() -> Value {
    json!({
        "field": "name",
        "dir": "asc"
    })
}

fn default_true() -> bool {
    true
}

/// Complete catalog of valid values for every Customize Studio setting so AI agents can discover
/// and set any option accurately without guessing.
pub fn appearance_options_catalog() -> Value {
    serde_json::from_str(
        r#"{
            "theme": ["zinc", "oled", "vermilion", "stone", "amber", "crimson", "emerald", "slate"],
            "mode": ["dark", "light"],
            "accent": ["mono", "vermilion", "emerald", "blue", "violet", "rose", "amber"],
            "customColors": ["primary", "background", "secondary", "card", "border", "foreground", "mutedForeground"],
            "fontFamily": ["geist", "inter", "jakarta", "manrope", "dm-sans", "space-grotesk", "outfit", "sora", "bricolage", "ibm-plex", "system"],
            "monoFont": ["jetbrains", "geist-mono", "fira-code", "ibm-mono", "space-mono", "system-mono"],
            "fontSize": ["sm", "md", "lg"],
            "radius": ["sharp", "balanced", "round"],
            "density": ["compact", "comfortable", "spacious"],
            "borders": ["subtle", "crisp", "borderless"],
            "surfaceStyle": ["bordered", "flat", "minimal_top", "borderless", "glass", "elevated"],
            "bgPattern": ["clean", "dot_grid", "fine_grid", "top_glow", "vignette"],
            "themeTransition": ["circle-blur", "circle", "blur-fade", "swipe", "polygon", "bottom-up", "rectangle", "blinds"],
            "themeTransitionStart": ["trigger", "center", "top-left", "top-right", "bottom-left", "bottom-right"],
            "themeToggleStyle": ["eclipse", "smoothui", "skiper-1", "skiper-2", "skiper-3", "skiper-4", "skiper-5"],
            "scrollProgressStyle": ["none", "skiper89", "skiper94", "skiper95"],
            "scrollRevealStyle": ["none", "blur-reveal", "slide-fade"],
            "navStyle": ["sidebar", "floating-navbar", "floating-dock", "floating-menu"],
            "windowRadius": ["sharp", "soft", "curved", "pill"],
            "iconPack": ["lucide", "skiper99", "tabler", "iconsax", "hugeicons", "itshover", "pulsoicon", "humbleicons", "majesticons"],
            "iconStroke": ["thin", "regular", "bold"],
            "trackIconStyle": ["ring", "filled", "minimal", "number"],
            "playingStyle": ["pulse", "equalizer", "pulse-bars", "minimal"],
            "playButtonStyle": ["classic", "waveform", "vinyl"],
            "visualizerStyle": ["orb", "wave-bars", "fluid-wave", "radial-ring", "aurora-pulse", "none"],
            "visualizerColor": ["theme", "spectrum", "mono"],
            "visualizerIntensity": ["subtle", "balanced", "dynamic"],
            "playerBarStyle": ["docked", "floating"],
            "scrubberKnob": ["ring", "solid", "line", "pill", "capsule", "waveform", "ticks"],
            "titlebarStyle": ["minimal", "macos", "dots", "pill", "geometric"],
            "titlebarAlign": ["right", "left"],
            "uiZoom": { "min": 50, "max": 200, "step": 10, "presets": [75, 80, 90, 100, 110, 125, 150, 175, 200] },
            "crossfadeSecs": { "min": 0.0, "max": 10.0 },
            "sortField": ["name", "artist", "album", "time", "size", "duration"],
            "sortDir": ["asc", "desc"]
        }"#,
    )
    .expect("valid appearance options catalog")
}

/// Shared portable application settings persisted at `~/zuno/.zuno/settings.json`.
/// Read and written by both the native GUI and `zuno-mcp` for live two-way sync.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    /// Monotonic counter bumped on every save so the GUI detects remote MCP updates in O(1).
    #[serde(default)]
    pub revision: u64,
    #[serde(default = "default_appearance_json")]
    pub appearance: Value,
    #[serde(default = "default_eq_json")]
    pub eq: Value,
    #[serde(default = "default_sort_json")]
    pub sort_pref: Value,
    #[serde(default)]
    pub last_played_ids: Vec<String>,
    #[serde(default = "default_true")]
    pub auto_check_updates: bool,
    #[serde(default)]
    pub skipped_update_version: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            revision: 0,
            appearance: default_appearance_json(),
            eq: default_eq_json(),
            sort_pref: default_sort_json(),
            last_played_ids: Vec::new(),
            auto_check_updates: true,
            skipped_update_version: None,
        }
    }
}

pub fn clamp_db(v: f32) -> f32 {
    if !v.is_finite() {
        return 0.0;
    }
    ((v * 2.0).round() / 2.0).clamp(EQ_MIN_DB, EQ_MAX_DB)
}

pub fn clamp_ui_zoom(pct: f64) -> f64 {
    if !pct.is_finite() {
        return 100.0;
    }
    pct.clamp(UI_ZOOM_MIN, UI_ZOOM_MAX).round()
}

pub fn clamp_crossfade(secs: f32) -> f32 {
    if !secs.is_finite() {
        return 0.0;
    }
    ((secs * 2.0).round() / 2.0).clamp(0.0, CROSSFADE_MAX_SECS)
}

/// Deep-merge JSON objects (patch keys overwrite target keys; nested objects merge recursively;
/// `null` removes an optional override key inside `customColors`).
pub fn deep_merge_object(target: &mut Value, patch: &Value, prune_nulls: bool) {
    let (Some(dst), Some(src)) = (target.as_object_mut(), patch.as_object()) else {
        return;
    };
    for (k, v) in src {
        if prune_nulls && v.is_null() {
            dst.remove(k);
            continue;
        }
        if let Some(sub_src) = v.as_object() {
            if let Some(existing) = dst.get_mut(k) {
                if existing.is_object() {
                    let is_custom_colors = k == "customColors";
                    if is_custom_colors && sub_src.is_empty() {
                        *existing = Value::Object(Map::new());
                    } else {
                        deep_merge_object(existing, v, is_custom_colors || prune_nulls);
                    }
                    continue;
                }
            }
        }
        dst.insert(k.clone(), v.clone());
    }
}

/// Normalize & clamp numeric bounds inside `AppSettings` so neither human nor AI can write
/// invalid zoom, crossfade, or EQ dB values.
pub fn sanitize_settings(settings: &mut AppSettings) {
    let mut base_app = default_appearance_json();
    if settings.appearance.is_object() {
        deep_merge_object(&mut base_app, &settings.appearance, false);
    }
    if let Some(obj) = base_app.as_object_mut() {
        if let Some(z) = obj.get("uiZoom").and_then(Value::as_f64) {
            obj.insert("uiZoom".into(), json!(clamp_ui_zoom(z) as i64));
        }
        if let Some(cf) = obj.get("crossfadeSecs").and_then(Value::as_f64) {
            obj.insert("crossfadeSecs".into(), json!(clamp_crossfade(cf as f32)));
        }
    }
    settings.appearance = base_app;

    let mut base_eq = default_eq_json();
    if settings.eq.is_object() {
        deep_merge_object(&mut base_eq, &settings.eq, false);
    }
    if let Some(obj) = base_eq.as_object_mut() {
        let enabled = obj.get("enabled").and_then(Value::as_bool).unwrap_or(false);
        let preamp = obj
            .get("preamp")
            .and_then(Value::as_f64)
            .map(|v| clamp_db(v as f32))
            .unwrap_or(0.0);
        let limiter = obj.get("limiter").and_then(Value::as_bool).unwrap_or(true);
        let mut bands = vec![0.0f32; EQ_BANDS_COUNT];
        if let Some(arr) = obj.get("bands").and_then(Value::as_array) {
            for (i, v) in arr.iter().take(EQ_BANDS_COUNT).enumerate() {
                if let Some(n) = v.as_f64() {
                    bands[i] = clamp_db(n as f32);
                }
            }
        }
        obj.insert("enabled".into(), json!(enabled));
        obj.insert("preamp".into(), json!(preamp));
        obj.insert("limiter".into(), json!(limiter));
        obj.insert("bands".into(), json!(bands));
        if !obj.get("customPresets").map(Value::is_array).unwrap_or(false) {
            obj.insert("customPresets".into(), json!([]));
        }
    }
    settings.eq = base_eq;

    let mut base_sort = default_sort_json();
    if let Some(src) = settings.sort_pref.as_object() {
        if let Some(field) = src.get("field").and_then(Value::as_str) {
            let valid = matches!(field, "name" | "artist" | "album" | "time" | "size" | "duration");
            if valid {
                base_sort["field"] = json!(field);
            }
        }
        if let Some(dir) = src.get("dir").and_then(Value::as_str) {
            if matches!(dir, "asc" | "desc") {
                base_sort["dir"] = json!(dir);
            }
        }
    }
    settings.sort_pref = base_sort;

    // Deduplicate & cap last_played_ids
    let mut dedup = Vec::with_capacity(settings.last_played_ids.len().min(LAST_PLAYED_MAX));
    for id in &settings.last_played_ids {
        if !id.is_empty() && !dedup.contains(id) {
            dedup.push(id.clone());
            if dedup.len() >= LAST_PLAYED_MAX {
                break;
            }
        }
    }
    settings.last_played_ids = dedup;
}

/// Load `~/zuno/.zuno/settings.json`, returning default settings (`revision: 0`) if not yet written.
pub fn load_app_settings(paths: &ZunoPaths) -> AppSettings {
    let path = paths.settings_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return AppSettings::default();
    };
    let mut parsed = serde_json::from_str::<AppSettings>(&raw).unwrap_or_default();
    if parsed.revision == 0 {
        parsed.revision = 1;
    }
    sanitize_settings(&mut parsed);
    parsed
}

/// Atomically persist `AppSettings` to `~/zuno/.zuno/settings.json`, incrementing `revision`.
pub fn save_app_settings(paths: &ZunoPaths, settings: &mut AppSettings) -> Result<()> {
    paths.ensure_dirs()?;
    sanitize_settings(settings);
    settings.revision = settings.revision.saturating_add(1).max(1);
    let bytes = serde_json::to_vec_pretty(settings)?;
    atomic_write(&paths.settings_path(), &bytes)?;
    Ok(())
}

/// Apply a partial JSON patch onto `AppSettings`. Accepts either top-level `AppSettings` keys
/// (`appearance`, `eq`, `sort_pref`, `last_played_ids`, `auto_check_updates`, `skipped_update_version`)
/// or flat appearance keys directly if `appearance` isn't wrapped (ergonomic for AI agents).
pub fn apply_settings_patch(settings: &mut AppSettings, patch: &Value) {
    let Some(obj) = patch.as_object() else {
        return;
    };

    if let Some(app_patch) = obj.get("appearance") {
        deep_merge_object(&mut settings.appearance, app_patch, false);
    }
    if let Some(eq_patch) = obj.get("eq") {
        deep_merge_object(&mut settings.eq, eq_patch, false);
    }
    if let Some(sort_patch) = obj.get("sort_pref").or_else(|| obj.get("sortPref")) {
        deep_merge_object(&mut settings.sort_pref, sort_patch, false);
    }
    if let Some(arr) = obj
        .get("last_played_ids")
        .or_else(|| obj.get("lastPlayedIds"))
        .and_then(Value::as_array)
    {
        settings.last_played_ids = arr
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
    }
    if let Some(auto) = obj
        .get("auto_check_updates")
        .or_else(|| obj.get("autoCheckUpdates"))
        .and_then(Value::as_bool)
    {
        settings.auto_check_updates = auto;
    }
    if let Some(skip) = obj
        .get("skipped_update_version")
        .or_else(|| obj.get("skippedUpdateVersion"))
    {
        settings.skipped_update_version = skip.as_str().map(str::to_string);
    }

    // Ergonomic flat appearance keys (e.g. `{ "theme": "oled", "uiZoom": 110 }`)
    let default_app = default_appearance_json();
    if let Some(known_app_keys) = default_app.as_object() {
        let mut flat_patch = Map::new();
        for (k, v) in obj {
            if known_app_keys.contains_key(k) {
                flat_patch.insert(k.clone(), v.clone());
            }
        }
        if !flat_patch.is_empty() {
            deep_merge_object(&mut settings.appearance, &Value::Object(flat_patch), false);
        }
    }

    sanitize_settings(settings);
}

pub fn extract_eq_tuple(settings: &AppSettings) -> (bool, f32, bool, [f32; EQ_BANDS_COUNT]) {
    let enabled = settings
        .eq
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let preamp = settings
        .eq
        .get("preamp")
        .and_then(Value::as_f64)
        .map(|v| clamp_db(v as f32))
        .unwrap_or(0.0);
    let limiter = settings
        .eq
        .get("limiter")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let mut bands = [0.0f32; EQ_BANDS_COUNT];
    if let Some(arr) = settings.eq.get("bands").and_then(Value::as_array) {
        for (i, v) in arr.iter().take(EQ_BANDS_COUNT).enumerate() {
            if let Some(n) = v.as_f64() {
                bands[i] = clamp_db(n as f32);
            }
        }
    }
    (enabled, preamp, limiter, bands)
}

pub fn extract_crossfade_secs(settings: &AppSettings) -> f32 {
    settings
        .appearance
        .get("crossfadeSecs")
        .and_then(Value::as_f64)
        .map(|v| clamp_crossfade(v as f32))
        .unwrap_or(0.0)
}

pub fn extract_ui_zoom(settings: &AppSettings) -> f64 {
    settings
        .appearance
        .get("uiZoom")
        .and_then(Value::as_f64)
        .map(clamp_ui_zoom)
        .unwrap_or(100.0)
}

pub fn apply_eq_preset(settings: &mut AppSettings, preset_id: &str) -> Result<EqPresetSpec> {
    let needle = preset_id.trim().to_ascii_lowercase();
    let found_builtin = builtin_eq_presets()
        .into_iter()
        .find(|p| p.id.eq_ignore_ascii_case(&needle) || p.name.eq_ignore_ascii_case(&needle));

    let found = match found_builtin {
        Some(p) => Some(p),
        None => settings
            .eq
            .get("customPresets")
            .and_then(Value::as_array)
            .and_then(|arr| {
                arr.iter().find_map(|item| {
                    let parsed = serde_json::from_value::<EqPresetSpec>(item.clone()).ok()?;
                    (parsed.id.eq_ignore_ascii_case(&needle)
                        || parsed.name.eq_ignore_ascii_case(&needle))
                    .then_some(parsed)
                })
            }),
    };

    let preset = found.ok_or_else(|| {
        ZunoError::NotFound(format!(
            "EQ preset '{preset_id}' not found (check get_equalizer for valid preset IDs)"
        ))
    })?;

    if let Some(obj) = settings.eq.as_object_mut() {
        obj.insert("enabled".into(), json!(true));
        obj.insert("presetId".into(), json!(preset.id));
        obj.insert("preamp".into(), json!(clamp_db(preset.preamp)));
        obj.insert(
            "bands".into(),
            json!(
                preset
                    .bands
                    .iter()
                    .take(EQ_BANDS_COUNT)
                    .map(|v| clamp_db(*v))
                    .collect::<Vec<_>>()
            ),
        );
    }
    sanitize_settings(settings);
    Ok(preset)
}

pub fn save_custom_eq_preset(
    settings: &mut AppSettings,
    name: &str,
    bands_override: Option<Vec<f32>>,
    preamp_override: Option<f32>,
) -> Result<EqPresetSpec> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err(ZunoError::InvalidPlaylistName(
            "preset name cannot be empty".into(),
        ));
    }

    let (_, cur_preamp, _, cur_bands) = extract_eq_tuple(settings);
    let bands: Vec<f32> = match bands_override {
        Some(b) => {
            let mut out = vec![0.0f32; EQ_BANDS_COUNT];
            for (i, v) in b.into_iter().take(EQ_BANDS_COUNT).enumerate() {
                out[i] = clamp_db(v);
            }
            out
        }
        None => cur_bands.to_vec(),
    };
    let preamp = preamp_override.map(clamp_db).unwrap_or(cur_preamp);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let preset = EqPresetSpec {
        id: format!("custom-{now_ms}"),
        name: clean_name.to_string(),
        tagline: "Custom sound profile".to_string(),
        category: "custom".to_string(),
        bands: bands.clone(),
        preamp,
        custom: true,
    };

    if let Some(obj) = settings.eq.as_object_mut() {
        obj.insert("enabled".into(), json!(true));
        obj.insert("presetId".into(), json!(preset.id));
        obj.insert("preamp".into(), json!(preamp));
        obj.insert("bands".into(), json!(bands));
        let mut list = obj
            .get("customPresets")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        list.insert(0, serde_json::to_value(&preset)?);
        obj.insert("customPresets".into(), Value::Array(list));
    }
    sanitize_settings(settings);
    Ok(preset)
}

pub fn delete_custom_eq_preset(settings: &mut AppSettings, id: &str) -> bool {
    let mut removed = false;
    if let Some(obj) = settings.eq.as_object_mut() {
        if let Some(arr) = obj.get_mut("customPresets").and_then(Value::as_array_mut) {
            let before = arr.len();
            arr.retain(|item| item.get("id").and_then(Value::as_str) != Some(id));
            removed = arr.len() != before;
        }
        if obj.get("presetId").and_then(Value::as_str) == Some(id) {
            obj.insert("presetId".into(), Value::Null);
        }
    }
    removed
}

pub fn reset_eq(settings: &mut AppSettings) {
    if let Some(obj) = settings.eq.as_object_mut() {
        obj.insert("presetId".into(), json!("flat"));
        obj.insert("preamp".into(), json!(0.0));
        obj.insert("bands".into(), json!(vec![0.0f32; EQ_BANDS_COUNT]));
    }
    sanitize_settings(settings);
}

pub fn record_last_played(settings: &mut AppSettings, track_id: &str) {
    if track_id.is_empty() {
        return;
    }
    settings.last_played_ids.retain(|id| id != track_id);
    settings.last_played_ids.insert(0, track_id.to_string());
    settings.last_played_ids.truncate(LAST_PLAYED_MAX);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSummary {
    pub backup_path: String,
    pub files_count: usize,
    pub playlist_count: usize,
    pub created_at_unix: u64,
}

/// Zero-copy backup of playlists, sources, playback state, radio bookmarks, and settings
/// into `~/zuno/.zuno/backups/` (never duplicates `songs/`, retains last 5 snapshots).
pub fn backup_user_data_core(
    paths: &ZunoPaths,
    current_version: &str,
    extra_ui_settings_json: Option<&str>,
) -> Result<BackupSummary> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backups_root = paths.cache_dir().join("backups");
    let backup_dir = backups_root.join(format!("backup-v{current_version}-{now}"));
    let backup_playlists = backup_dir.join("playlists");
    fs::create_dir_all(&backup_playlists)?;

    let mut files_count = 0usize;
    let mut playlist_count = 0usize;

    if let Ok(entries) = fs::read_dir(paths.playlists_dir()) {
        for entry in entries.flatten() {
            let src = entry.path();
            if src.is_file() {
                if let Some(name) = src.file_name() {
                    if fs::copy(&src, backup_playlists.join(name)).is_ok() {
                        files_count += 1;
                        playlist_count += 1;
                    }
                }
            }
        }
    }

    for meta in [
        paths.sources_path(),
        paths.state_path(),
        paths.index_path(),
        paths.radio_path(),
        paths.settings_path(),
    ] {
        if meta.is_file() {
            if let Some(name) = meta.file_name() {
                if fs::copy(&meta, backup_dir.join(name)).is_ok() {
                    files_count += 1;
                }
            }
        }
    }

    if let Some(ui_json) = extra_ui_settings_json {
        if !ui_json.trim().is_empty()
            && atomic_write(&backup_dir.join("ui-settings.json"), ui_json.as_bytes()).is_ok()
        {
            files_count += 1;
        }
    }

    let manifest = json!({
        "app": "zuno",
        "version": current_version,
        "created_at_unix": now,
        "files_count": files_count,
        "playlist_count": playlist_count,
        "note": "Zero-copy backup of playlists, folder links, radio bookmarks, and settings. Audio files remain untouched."
    });
    let _ = atomic_write(
        &backup_dir.join("manifest.json"),
        &serde_json::to_vec_pretty(&manifest)?,
    );

    prune_old_backups(&backups_root, MAX_BACKUPS_KEPT);

    Ok(BackupSummary {
        backup_path: backup_dir.display().to_string(),
        files_count,
        playlist_count,
        created_at_unix: now,
    })
}

fn prune_old_backups(backups_root: &Path, keep: usize) {
    let Ok(entries) = fs::read_dir(backups_root) else {
        return;
    };
    let mut dirs: Vec<(SystemTime, std::path::PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if !p.is_dir() {
                return None;
            }
            let modified = e.metadata().ok()?.modified().unwrap_or(UNIX_EPOCH);
            Some((modified, p))
        })
        .collect();
    dirs.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, stale) in dirs.into_iter().skip(keep) {
        let _ = fs::remove_dir_all(stale);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn settings_merge_clamp_eq_presets_and_backup_work() {
        let tmp = tempdir().unwrap();
        let paths = ZunoPaths::new(tmp.path());
        paths.ensure_dirs().unwrap();

        let mut s = load_app_settings(&paths);
        assert_eq!(s.revision, 0);
        assert_eq!(extract_ui_zoom(&s), 100.0);

        apply_settings_patch(
            &mut s,
            &json!({
                "theme": "oled",
                "uiZoom": 250,
                "crossfadeSecs": 15.0,
                "appearance": { "customColors": { "primary": "#ff0000" } },
                "sort_pref": { "field": "duration", "dir": "desc" }
            }),
        );
        assert_eq!(s.appearance["theme"], "oled");
        assert_eq!(extract_ui_zoom(&s), 200.0);
        assert_eq!(extract_crossfade_secs(&s), 10.0);
        assert_eq!(s.appearance["customColors"]["primary"], "#ff0000");
        assert_eq!(s.sort_pref["field"], "duration");

        let preset = apply_eq_preset(&mut s, "bass-boost").unwrap();
        assert_eq!(preset.id, "bass-boost");
        let (enabled, preamp, _, bands) = extract_eq_tuple(&s);
        assert!(enabled);
        assert_eq!(preamp, -2.5);
        assert_eq!(bands[0], 6.0);

        let custom = save_custom_eq_preset(&mut s, "Night Drive", None, None).unwrap();
        assert!(custom.custom);
        assert!(delete_custom_eq_preset(&mut s, &custom.id));

        record_last_played(&mut s, "track-a");
        record_last_played(&mut s, "track-b");
        record_last_played(&mut s, "track-a");
        assert_eq!(s.last_played_ids, vec!["track-a", "track-b"]);

        save_app_settings(&paths, &mut s).unwrap();
        assert_eq!(s.revision, 1);

        let reloaded = load_app_settings(&paths);
        assert_eq!(reloaded.revision, 1);
        assert_eq!(reloaded.appearance["theme"], "oled");

        let backup = backup_user_data_core(&paths, "0.0.22", None).unwrap();
        assert!(backup.files_count >= 1);
        assert!(Path::new(&backup.backup_path).join("settings.json").is_file());
    }
}
