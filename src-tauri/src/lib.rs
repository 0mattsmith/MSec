#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Lets the app hand URLs (release pages, APK downloads) to the OS
        // browser instead of trying to navigate inside the webview.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running MSec");
}
