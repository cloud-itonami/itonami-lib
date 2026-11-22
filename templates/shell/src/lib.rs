// The whole app is itonami-series-host (cloud-itonami/itonami-lib); the context is this repository's own.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() { itonami_series_host::run(tauri::generate_context!()) }
