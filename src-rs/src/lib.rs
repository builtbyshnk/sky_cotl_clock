use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use domain::events::{EventGenerationSettings, EventInstance};
use domain::skygame::{
    SkyActiveRoute, SkyCalendarQuery, SkyItemSearchQuery, SkyRouteFilters, SkyRouteProgress,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

pub mod domain;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const DISCORD_CLIENT_ID: Option<&str> = option_env!("ISEKAI_DISCORD_CLIENT_ID");
const ISEKAI_DISCORD_URL: &str = "https://github.com/radcolor-dev/sky_cotl_clock";
const SKY_DISCORD_URL: &str = "https://www.thatskygame.com/";
const MAX_DISCORD_FIELD_LENGTH: usize = 128;

#[cfg(not(debug_assertions))]
fn prevent_default_shortcuts() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    #[cfg(target_os = "windows")]
    {
        use tauri_plugin_prevent_default::{Builder, PlatformOptions};

        Builder::new()
            .platform(
                PlatformOptions::new()
                    .browser_accelerator_keys(false)
                    .default_context_menus(false),
            )
            .build()
    }

    #[cfg(not(target_os = "windows"))]
    {
        tauri_plugin_prevent_default::init()
    }
}

#[derive(Default)]
struct DiscordRpcManager {
    client: Option<DiscordIpcClient>,
    client_id: Option<String>,
    connected: bool,
    active: bool,
    last_error: Option<String>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordRpcButtonPayload {
    label: String,
    url: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordRpcPresencePayload {
    details: String,
    state: String,
    large_image_key: String,
    large_image_text: String,
    small_image_key: String,
    small_image_text: String,
    start_timestamp: Option<i64>,
    end_timestamp: Option<i64>,
    buttons: Vec<DiscordRpcButtonPayload>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordRpcBuildPayload {
    settings: Value,
    events: Vec<Value>,
    planner: Value,
    sky_process_running: bool,
    session_started_at_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscordRpcStatus {
    configured: bool,
    connected: bool,
    active: bool,
    last_error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReleaseNotes {
    release_date: Option<String>,
    release_notes: String,
}

#[tauri::command]
fn is_process_running(process_names: Vec<String>) -> Result<bool, String> {
    let normalized_names = normalize_process_names(process_names);

    if normalized_names.is_empty() {
        return Ok(false);
    }

    let processes = process_list()?;

    Ok(processes
        .into_iter()
        .any(|process| process_matches(&process, &normalized_names)))
}

#[tauri::command]
fn discord_rpc_status(
    client_id: String,
    state: tauri::State<'_, Mutex<DiscordRpcManager>>,
) -> DiscordRpcStatus {
    let manager = state.lock().expect("discord rpc mutex poisoned");
    manager.status(resolve_discord_client_id(&client_id).is_some())
}

#[tauri::command]
fn discord_rpc_update(
    payload: DiscordRpcPresencePayload,
    client_id: String,
    state: tauri::State<'_, Mutex<DiscordRpcManager>>,
) -> Result<DiscordRpcStatus, String> {
    let mut manager = state.lock().expect("discord rpc mutex poisoned");
    let resolved_client_id = resolve_discord_client_id(&client_id)
        .ok_or_else(|| manager.set_error("Discord client ID is not configured".to_string()))?;
    manager.update(payload, resolved_client_id)?;
    Ok(manager.status(true))
}

#[tauri::command]
fn discord_rpc_clear(
    state: tauri::State<'_, Mutex<DiscordRpcManager>>,
) -> Result<DiscordRpcStatus, String> {
    let mut manager = state.lock().expect("discord rpc mutex poisoned");
    manager.clear()?;
    Ok(manager.status(resolve_discord_client_id("").is_some()))
}

#[tauri::command]
fn generate_event_instances(
    now_ms: i64,
    settings: EventGenerationSettings,
) -> Result<Vec<EventInstance>, String> {
    let now = chrono::DateTime::from_timestamp_millis(now_ms)
        .ok_or_else(|| domain::DomainError::invalid_input("Invalid event timestamp"))?;

    Ok(domain::events::generate_event_instances(now, &settings))
}

#[tauri::command]
fn get_overlay_events(
    now_ms: i64,
    settings: EventGenerationSettings,
) -> Result<Vec<EventInstance>, String> {
    let now = chrono::DateTime::from_timestamp_millis(now_ms)
        .ok_or_else(|| domain::DomainError::invalid_input("Invalid event timestamp"))?;

    Ok(domain::events::get_overlay_events(now, &settings))
}

#[tauri::command]
fn build_discord_rpc_presence(payload: DiscordRpcBuildPayload) -> Option<Value> {
    let discord = &payload.settings["discordRpc"];
    let enabled = discord["enabled"].as_bool() == Some(true);
    let require_sky_detection = discord["requireSkyDetection"].as_bool() != Some(false);

    if !enabled || (require_sky_detection && !payload.sky_process_running) {
        return None;
    }

    let source = select_presence_source(&payload.settings, &payload.events, &payload.planner);
    let show_buttons = discord["showButtons"].as_bool() != Some(false);
    let buttons = if show_buttons {
        json!([
            { "label": "Isekai", "url": ISEKAI_DISCORD_URL },
            { "label": "Sky", "url": SKY_DISCORD_URL }
        ])
    } else {
        json!([])
    };

    Some(json!({
        "details": clamp_discord_field(source["details"].as_str().unwrap_or("Using Isekai for Sky")),
        "state": clamp_discord_field(source["state"].as_str().unwrap_or("Playing Sky")),
        "largeImageKey": "isekai_logo",
        "largeImageText": "Isekai for Sky: Children of the Light",
        "smallImageKey": "sky_logo",
        "smallImageText": "Playing Sky",
        "startTimestamp": payload.session_started_at_ms / 1_000,
        "endTimestamp": source.get("endTimestamp").cloned().unwrap_or(Value::Null),
        "buttons": buttons,
    }))
}

#[tauri::command]
async fn fetch_release_notes_for_version(version: String) -> ReleaseNotes {
    let tag = format!("v{version}");
    let url = format!(
        "https://api.github.com/repos/radcolor-dev/sky_cotl_clock/releases/tags/{}",
        tag
    );
    let response = reqwest::Client::new()
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Isekai")
        .send()
        .await;

    let Ok(response) = response else {
        return empty_release_notes();
    };

    if !response.status().is_success() {
        return empty_release_notes();
    }

    let Ok(release) = response.json::<Value>().await else {
        return empty_release_notes();
    };

    ReleaseNotes {
        release_date: release["published_at"].as_str().map(str::to_string),
        release_notes: release["body"]
            .as_str()
            .map(str::trim)
            .filter(|body| !body.is_empty())
            .unwrap_or("")
            .to_string(),
    }
}

#[tauri::command]
fn skygame_get_meta() -> Value {
    domain::skygame::sky_game_data().meta().clone()
}

#[tauri::command]
fn skygame_get_stats() -> Value {
    domain::skygame::sky_game_data().stats().clone()
}

#[tauri::command]
fn skygame_get_source_stats() -> Value {
    domain::skygame::sky_game_data().source_stats().clone()
}

#[tauri::command]
fn skygame_get_source_groups() -> Value {
    domain::skygame::sky_game_data().source_groups().clone()
}

#[tauri::command]
fn skygame_get_candle_runs() -> Vec<Value> {
    domain::skygame::sky_game_data().candle_runs()
}

#[tauri::command]
fn skygame_get_candle_run(guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().candle_run(&guid)
}

#[tauri::command]
fn skygame_get_realms() -> Vec<Value> {
    domain::skygame::sky_game_data().realms()
}

#[tauri::command]
fn skygame_get_realm(guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().realm(&guid)
}

#[tauri::command]
fn skygame_get_area(guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().area(&guid)
}

#[tauri::command]
fn skygame_get_areas_for_realm(realm_guid: String) -> Vec<Value> {
    domain::skygame::sky_game_data().areas_for_realm(&realm_guid)
}

#[tauri::command]
fn skygame_get_calendar_entries(query: SkyCalendarQuery) -> Vec<Value> {
    domain::skygame::sky_game_data().calendar_entries(&query)
}

#[tauri::command]
fn skygame_search_items(query: SkyItemSearchQuery) -> Vec<Value> {
    domain::skygame::sky_game_data().search_items(&query)
}

#[tauri::command]
fn skygame_get_item_detail(guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().item_detail(&guid)
}

#[tauri::command]
fn skygame_get_realm_route(realm_guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().realm_route(&realm_guid)
}

#[tauri::command]
fn skygame_get_area_route(area_guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().area_route(&area_guid)
}

#[tauri::command]
fn skygame_get_route_targets(area_guid: String, filters: SkyRouteFilters) -> Vec<Value> {
    domain::skygame::sky_game_data().route_targets(&area_guid, &filters)
}

#[tauri::command]
fn skygame_get_route_target(guid: String) -> Option<Value> {
    domain::skygame::sky_game_data().route_target(&guid)
}

#[tauri::command]
fn skygame_get_mini_map_pins(area_guid: String, filters: SkyRouteFilters) -> Vec<Value> {
    domain::skygame::sky_game_data().mini_map_pins(&area_guid, &filters)
}

#[tauri::command]
fn skygame_get_active_route_target(
    active_route: Option<SkyActiveRoute>,
    progress: Option<SkyRouteProgress>,
) -> Option<Value> {
    domain::skygame::sky_game_data().active_route_target(active_route.as_ref(), progress.as_ref())
}

fn select_presence_source(settings: &Value, events: &[Value], planner: &Value) -> Value {
    let mode = settings["discordRpc"]["mode"].as_str().unwrap_or("auto");
    let safe_preset = settings["discordRpc"]["safePreset"]
        .as_str()
        .unwrap_or("planning");

    if mode != "auto" {
        return presence_source_for_mode(mode, settings, events, planner)
            .unwrap_or_else(|| preset_presence(safe_preset));
    }

    event_presence(events)
        .or_else(|| candle_run_presence(planner))
        .or_else(|| route_presence(planner))
        .or_else(|| goals_presence(planner))
        .or_else(|| overlay_presence(settings))
        .unwrap_or_else(|| preset_presence(safe_preset))
}

fn presence_source_for_mode(
    mode: &str,
    settings: &Value,
    events: &[Value],
    planner: &Value,
) -> Option<Value> {
    match mode {
        "events" => event_presence(events),
        "candleRun" => candle_run_presence(planner),
        "route" => route_presence(planner),
        "goals" => goals_presence(planner),
        "overlay" => overlay_presence(settings),
        _ => None,
    }
}

fn event_presence(events: &[Value]) -> Option<Value> {
    let event = events.iter().find(|event| {
        matches!(
            event["status"].as_str(),
            Some("active" | "preparing" | "upcoming" | "endingSoon")
        )
    })?;
    let status = event["status"].as_str().unwrap_or("upcoming");
    let end_timestamp = if status == "upcoming" {
        timestamp_seconds(event["startsAtUtc"].as_str())
    } else {
        timestamp_seconds(event["endsAtUtc"].as_str())
    };
    let state = [event["location"].as_str(), event["phaseLabel"].as_str()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" - ");
    let title = event["title"].as_str().unwrap_or("Sky event");
    let details = if matches!(status, "active" | "endingSoon") {
        format!("Tracking {title}")
    } else {
        format!("Waiting for {title}")
    };

    Some(json!({
        "details": details,
        "state": if state.is_empty() { "Playing Sky with Isekai".to_string() } else { state },
        "endTimestamp": end_timestamp,
    }))
}

fn candle_run_presence(planner: &Value) -> Option<Value> {
    let data = domain::skygame::sky_game_data();
    let run_guid = planner["candleRun"]["activeRunGuid"]
        .as_str()
        .map(str::to_string)
        .or_else(|| {
            data.candle_runs()
                .first()
                .and_then(|run| run["guid"].as_str())
                .map(str::to_string)
        })?;
    let run = data.candle_run(&run_guid)?;
    let groups = run["groups"].as_array()?;
    let completed_groups = planner["candleRun"]["completedGroups"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let completed_group_count = groups
        .iter()
        .enumerate()
        .filter(|(index, group)| {
            let key = candle_group_key(&run_guid, group["name"].as_str().unwrap_or(""), *index);
            completed_groups.get(&key).and_then(Value::as_bool) == Some(true)
        })
        .count();
    let total_wax = groups.iter().map(count_candle_group_wax_value).sum::<i64>();
    let completed_wax = groups
        .iter()
        .enumerate()
        .filter(|(index, group)| {
            let key = candle_group_key(&run_guid, group["name"].as_str().unwrap_or(""), *index);
            completed_groups.get(&key).and_then(Value::as_bool) == Some(true)
        })
        .map(|(_, group)| count_candle_group_wax_value(group))
        .sum::<i64>();

    Some(json!({
        "details": format!("Candle run: {}", run["name"].as_str().unwrap_or("Sky route")),
        "state": format!("{completed_group_count}/{} groups, {completed_wax}/{total_wax} wax", groups.len()),
    }))
}

fn route_presence(planner: &Value) -> Option<Value> {
    let data = domain::skygame::sky_game_data();
    let active_route =
        serde_json::from_value::<SkyActiveRoute>(planner["activeRoute"].clone()).ok()?;
    let progress =
        serde_json::from_value::<SkyRouteProgress>(planner["routeProgress"].clone()).ok()?;
    let active = data.active_route_target(Some(&active_route), Some(&progress))?;
    let area_guid = active_route.area_guid.as_deref()?;
    let area = data.area(area_guid)?;
    let realm_name = area["realmName"].as_str().unwrap_or("");
    let area_name = area["name"].as_str().unwrap_or("Sky route");
    let details = if realm_name.is_empty() {
        format!("Route: {area_name}")
    } else {
        format!("Route: {realm_name} - {area_name}")
    };

    Some(json!({
        "details": details,
        "state": format!(
            "{}/{} targets complete",
            active["completedCount"].as_u64().unwrap_or(0),
            active["total"].as_u64().unwrap_or(0),
        ),
    }))
}

fn goals_presence(planner: &Value) -> Option<Value> {
    let goals = planner["goals"].as_array()?;
    let open_goals = goals
        .iter()
        .filter(|goal| goal["status"].as_str() != Some("done"))
        .collect::<Vec<_>>();
    if open_goals.is_empty() {
        return None;
    }

    let mut due_dates = open_goals
        .iter()
        .filter_map(|goal| goal["dueDate"].as_str())
        .collect::<Vec<_>>();
    due_dates.sort_unstable();
    let state = if let Some(due_date) = due_dates.first() {
        format!("{} open goals, next due {due_date}", open_goals.len())
    } else {
        format!("{} open goals with Isekai", open_goals.len())
    };

    Some(json!({
        "details": "Tracking Sky goals",
        "state": state,
    }))
}

fn overlay_presence(settings: &Value) -> Option<Value> {
    let mode = settings["overlay"]["mode"].as_str()?;
    let mode_label = match mode {
        "clock" => "clock",
        "route" => "route",
        "mini-map" => "mini map",
        "clock-route" => "clock + route",
        _ => "clock",
    };

    Some(json!({
        "details": "Using Isekai overlay",
        "state": format!("{mode_label} mode for Sky"),
    }))
}

fn preset_presence(preset: &str) -> Value {
    match preset {
        "farmingWax" => json!({
            "details": "Planning candle run",
            "state": "Playing Sky with Isekai",
        }),
        "trackingGoals" => json!({
            "details": "Tracking Sky goals",
            "state": "Using Isekai for Sky",
        }),
        "watchingTimers" => json!({
            "details": "Watching Sky timers",
            "state": "Using Isekai for Sky",
        }),
        _ => json!({
            "details": "Planning a Sky session",
            "state": "Using Isekai for Sky",
        }),
    }
}

fn timestamp_seconds(value: Option<&str>) -> Value {
    let Some(value) = value else {
        return Value::Null;
    };
    match chrono::DateTime::parse_from_rfc3339(value) {
        Ok(instant) => json!(instant.timestamp()),
        Err(_) => Value::Null,
    }
}

fn candle_group_key(run_guid: &str, group_name: &str, index: usize) -> String {
    format!("{run_guid}:{index}:{group_name}")
}

fn count_candle_group_wax_value(group: &Value) -> i64 {
    group["candles"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|candle| candle["c"].as_i64())
        .sum()
}

fn clamp_discord_field(value: &str) -> String {
    if value.len() <= MAX_DISCORD_FIELD_LENGTH {
        return value.to_string();
    }

    format!("{}...", &value[..MAX_DISCORD_FIELD_LENGTH - 3])
}

fn empty_release_notes() -> ReleaseNotes {
    ReleaseNotes {
        release_date: None,
        release_notes: String::new(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(Mutex::new(DiscordRpcManager::default()))
        .setup(|app| {
            let menu = MenuBuilder::new(app)
                .text("show-main", "Show Isekai")
                .separator()
                .text("quit", "Quit")
                .build()?;

            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Isekai")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show-main" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                    | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => show_main_window(tray.app_handle()),
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(prevent_default_shortcuts());

    builder
        .invoke_handler(tauri::generate_handler![
            is_process_running,
            discord_rpc_status,
            discord_rpc_update,
            discord_rpc_clear,
            generate_event_instances,
            get_overlay_events,
            build_discord_rpc_presence,
            fetch_release_notes_for_version,
            skygame_get_meta,
            skygame_get_stats,
            skygame_get_source_stats,
            skygame_get_source_groups,
            skygame_get_candle_runs,
            skygame_get_candle_run,
            skygame_get_realms,
            skygame_get_realm,
            skygame_get_area,
            skygame_get_areas_for_realm,
            skygame_get_calendar_entries,
            skygame_search_items,
            skygame_get_item_detail,
            skygame_get_realm_route,
            skygame_get_area_route,
            skygame_get_route_targets,
            skygame_get_route_target,
            skygame_get_mini_map_pins,
            skygame_get_active_route_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

impl DiscordRpcManager {
    fn status(&self, configured: bool) -> DiscordRpcStatus {
        DiscordRpcStatus {
            configured,
            connected: self.connected,
            active: self.active,
            last_error: self.last_error.clone(),
        }
    }

    fn update(
        &mut self,
        payload: DiscordRpcPresencePayload,
        client_id: String,
    ) -> Result<(), String> {
        self.ensure_connected(&client_id)?;
        let activity = build_discord_activity(&payload);

        if let Some(client) = self.client.as_mut() {
            match client.set_activity(activity.clone()) {
                Ok(()) => {
                    self.connected = true;
                    self.active = true;
                    self.last_error = None;
                    Ok(())
                }
                Err(error) => {
                    self.connected = false;
                    self.client = None;
                    self.client_id = None;
                    self.last_error = Some(error.to_string());
                    self.ensure_connected(&client_id)?;
                    let client = self
                        .client
                        .as_mut()
                        .ok_or_else(|| "Discord RPC client unavailable".to_string())?;
                    client
                        .set_activity(activity)
                        .map_err(|retry_error| self.set_error(retry_error.to_string()))?;
                    self.connected = true;
                    self.active = true;
                    self.last_error = None;
                    Ok(())
                }
            }
        } else {
            Err(self.set_error("Discord RPC client unavailable".to_string()))
        }
    }

    fn clear(&mut self) -> Result<(), String> {
        if let Some(client) = self.client.as_mut() {
            if let Err(error) = client.clear_activity() {
                self.connected = false;
                self.client = None;
                self.client_id = None;
                self.active = false;
                return Err(self.set_error(error.to_string()));
            }
        }

        self.active = false;
        self.last_error = None;
        Ok(())
    }

    fn ensure_connected(&mut self, client_id: &str) -> Result<(), String> {
        if self.connected && self.client.is_some() && self.client_id.as_deref() == Some(client_id) {
            return Ok(());
        }

        if self.client.is_some() {
            let _ = self.clear();
        }

        let mut client = DiscordIpcClient::new(client_id);
        client
            .connect()
            .map_err(|error| self.set_error(error.to_string()))?;

        self.client = Some(client);
        self.client_id = Some(client_id.to_string());
        self.connected = true;
        self.last_error = None;
        Ok(())
    }

    fn set_error(&mut self, error: String) -> String {
        self.last_error = Some(error.clone());
        error
    }
}

fn resolve_discord_client_id(override_client_id: &str) -> Option<String> {
    let trimmed_override = override_client_id.trim();
    if !trimmed_override.is_empty() {
        return Some(trimmed_override.to_string());
    }

    DISCORD_CLIENT_ID
        .map(str::trim)
        .filter(|client_id| !client_id.is_empty())
        .map(ToOwned::to_owned)
}

fn build_discord_activity(payload: &DiscordRpcPresencePayload) -> Activity<'_> {
    let mut activity = Activity::new()
        .details(payload.details.as_str())
        .state(payload.state.as_str())
        .assets(
            Assets::new()
                .large_image(payload.large_image_key.as_str())
                .large_text(payload.large_image_text.as_str())
                .small_image(payload.small_image_key.as_str())
                .small_text(payload.small_image_text.as_str()),
        );

    let mut timestamps = Timestamps::new();
    let has_timestamps = payload.start_timestamp.is_some() || payload.end_timestamp.is_some();
    if let Some(start) = payload.start_timestamp {
        timestamps = timestamps.start(start);
    }
    if let Some(end) = payload.end_timestamp {
        timestamps = timestamps.end(end);
    }
    if has_timestamps {
        activity = activity.timestamps(timestamps);
    }

    if !payload.buttons.is_empty() {
        activity = activity.buttons(
            payload
                .buttons
                .iter()
                .take(2)
                .map(|button| Button::new(button.label.as_str(), button.url.as_str()))
                .collect(),
        );
    }

    activity
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn strip_exe(name: &str) -> &str {
    name.strip_suffix(".exe").unwrap_or(name)
}

fn normalize_process_names(process_names: Vec<String>) -> Vec<String> {
    process_names
        .into_iter()
        .map(|name| name.trim().trim_matches('"').to_ascii_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

fn process_matches(process: &str, normalized_names: &[String]) -> bool {
    let process = process
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(process)
        .to_ascii_lowercase();

    normalized_names
        .iter()
        .any(|name| process == name.as_str() || process == strip_exe(name))
}

#[cfg(target_os = "windows")]
fn process_list() -> Result<Vec<String>, String> {
    let mut command = std::process::Command::new("tasklist");
    command
        .args(["/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("failed to run tasklist: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| line.split(',').next())
        .map(|name| name.trim().trim_matches('"').to_string())
        .filter(|name| !name.is_empty())
        .collect())
}

#[cfg(target_os = "macos")]
fn process_list() -> Result<Vec<String>, String> {
    unix_process_list()
}

#[cfg(target_os = "linux")]
fn process_list() -> Result<Vec<String>, String> {
    unix_process_list()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn unix_process_list() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("ps")
        .args(["-axo", "comm="])
        .output()
        .map_err(|error| format!("failed to run ps: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .filter_map(|line| line.rsplit('/').next())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn process_list() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}
