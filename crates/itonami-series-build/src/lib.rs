//! The whole build script of a classification-series app shell. The shell's
//! `build.rs` is one line: `fn main() { itonami_series_build::build() }`.
//!
//! - The app id is read from `tauri.conf.json` next to Cargo.toml and given
//!   to the app crate as `ITONAMI_APP_ID`, so no source file names it.
//! - On Android the native library's LOAD segments are aligned to 16 KB
//!   (Android 15+ devices may use 16 KB pages). A build-script link arg
//!   applies even when the Tauri CLI sets RUSTFLAGS.
//! - Tauri's own build step runs with the one app command, `awai_host_info`.

/// The `identifier` string of a tauri.conf.json text. Panics with a reason
/// when it is missing, not a JSON string, holds an unsupported escape or is empty.
pub fn read_app_id(text: &str) -> String {
    let key = "\"identifier\"";
    let from = text.find(key).expect("tauri.conf.json must declare an identifier");
    let after_key = &text[from + key.len()..];
    let colon = after_key.find(':').expect("identifier entry must hold a value");
    let mut chars = after_key[colon + 1..].trim_start().chars();
    assert!(chars.next() == Some('"'), "identifier must be a JSON string");
    let mut id = String::new();
    let mut closed = false;
    while let Some(c) = chars.next() {
        if c == '"' {
            closed = true;
            break;
        }
        if c == '\\' {
            let e = chars.next().expect("identifier holds a dangling escape");
            id.push(match e {
                '"' => '"',
                '\\' => '\\',
                '/' => '/',
                'n' => '\n',
                't' => '\t',
                _ => panic!("identifier holds an unsupported escape"),
            });
        } else {
            id.push(c);
        }
    }
    assert!(closed && !id.is_empty(), "identifier must not be empty");
    id
}

/// The link argument that aligns LOAD segments to 16 KB, for a target OS.
pub fn page_size_link_arg(target_os: Option<&str>) -> Option<&'static str> {
    (target_os == Some("android")).then_some("-Wl,-z,max-page-size=16384")
}

/// Run the series app's build step. Call it from build.rs.
pub fn build() {
    if let Some(arg) = page_size_link_arg(std::env::var("CARGO_CFG_TARGET_OS").ok().as_deref()) {
        println!("cargo:rustc-link-arg={arg}");
    }
    println!("cargo:rerun-if-changed=tauri.conf.json");
    let text = std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json must sit next to Cargo.toml");
    println!("cargo:rustc-env=ITONAMI_APP_ID={}", read_app_id(&text));
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["awai_host_info"])),
    )
    .expect("series app build");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_identifier() {
        assert_eq!(read_app_id(r#"{"productName": "x", "identifier": "network.itonami.isco2423"}"#), "network.itonami.isco2423");
        assert_eq!(read_app_id("{\"identifier\" :\n  \"a.b\\/c\"}"), "a.b/c");
    }

    #[test]
    #[should_panic(expected = "must declare an identifier")]
    fn no_identifier_fails() {
        read_app_id("{}");
    }

    #[test]
    #[should_panic(expected = "must not be empty")]
    fn empty_identifier_fails() {
        read_app_id(r#"{"identifier": ""}"#);
    }

    #[test]
    fn sixteen_kb_only_on_android() {
        assert_eq!(page_size_link_arg(Some("android")), Some("-Wl,-z,max-page-size=16384"));
        assert_eq!(page_size_link_arg(Some("macos")), None);
        assert_eq!(page_size_link_arg(None), None);
    }
}
