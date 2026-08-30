#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Self-updating is desktop-only: Android requires the user to confirm
    // every install, so the app downloads the APK and hands it to the system
    // installer instead.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        // Lets the app hand URLs (release pages, APK downloads) to the OS
        // browser instead of trying to navigate inside the webview.
        .plugin(tauri_plugin_opener::init())
        // Downloads the Android APK inside the app, with progress, so the
        // user isn't bounced out to a browser.
        .plugin(tauri_plugin_upload::init())
        .run(tauri::generate_context!())
        .expect("error while running MSec");
}
