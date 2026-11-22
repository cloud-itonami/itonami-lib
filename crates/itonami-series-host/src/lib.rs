//! The host of every classification-series app. All state lives in the
//! WebView and the host exposes one read-only command, `awai_host_info`.
//! There is no filesystem, network, shell or installer permission.
//!
//! The app shell calls it from its 3-line `src/lib.rs`:
//!
//! ```ignore
//! #[cfg_attr(mobile, tauri::mobile_entry_point)]
//! pub fn run() { itonami_series_host::run(tauri::generate_context!()) }
//! ```
//!
//! `generate_context!()` must expand in the app crate (it embeds that
//! repository's tauri.conf.json, icons and dist/), so the shell keeps it.
//! The app id shown by `awai_host_info` is the identifier of that config.
use std::sync::OnceLock;

static APP_ID: OnceLock<String> = OnceLock::new();

/// The JSON `awai_host_info` returns for an app id.
pub fn host_info(app: &str) -> serde_json::Value {
    serde_json::json!({"schema": "awai.shell.host.v1", "app": app})
}

#[tauri::command]
fn awai_host_info() -> serde_json::Value {
    host_info(APP_ID.get().map(String::as_str).unwrap_or(""))
}

/// Start the app with the context its own crate generated.
pub fn run(context: tauri::Context) {
    let _ = APP_ID.set(context.config().identifier.clone());
    tauri::Builder::default()
        .runtime(tauri_runtime_wry::Wry::default())
        .invoke_handler(tauri::generate_handler![awai_host_info])
        .run(context)
        .expect("classification-series app failed to start");
}

#[cfg(test)]
mod tests {
    #[test]
    fn host_info_names_the_app() {
        let v = super::host_info("network.itonami.isco2423");
        assert_eq!(v["schema"], "awai.shell.host.v1");
        assert_eq!(v["app"], "network.itonami.isco2423");
        assert_eq!(v.as_object().unwrap().len(), 2);
    }
}
