use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

#[tauri::command]
fn is_process_running(process_names: Vec<String>) -> Result<bool, String> {
    if process_names.is_empty() {
        return Ok(false);
    }

    let normalized_names = process_names
        .into_iter()
        .map(|name| name.trim().trim_matches('"').to_ascii_lowercase())
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();

    if normalized_names.is_empty() {
        return Ok(false);
    }

    let processes = process_list()?;

    Ok(processes.into_iter().any(|process| {
        let process = process.to_ascii_lowercase();
        normalized_names
            .iter()
            .any(|name| process == *name || process == strip_exe(name))
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![is_process_running])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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

#[cfg(target_os = "windows")]
fn process_list() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
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
