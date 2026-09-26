// The loopback OAuth listener is desktop-only. Android catches the redirect
// through a custom URI scheme instead, so none of this is compiled there.
#[cfg(desktop)]
mod oauth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Self-updating is desktop-only: Android requires the user to confirm
    // every install, so the app downloads the APK and hands it to the system
    // installer instead.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .manage(oauth::OauthState::default())
            .invoke_handler(tauri::generate_handler![
                oauth::oauth_start,
                oauth::oauth_cancel,
                oauth::oauth_await
            ]);
    }

    builder
        // Catches the Google redirect on Android, which arrives as a custom
        // scheme rather than to a loopback port.
        .plugin(tauri_plugin_deep_link::init())
        // Lets the app hand URLs (release pages, APK downloads, the Google
        // consent screen) to the OS browser instead of trying to navigate
        // inside the webview.
        .plugin(tauri_plugin_opener::init())
        // Downloads the Android APK inside the app, with progress, so the
        // user isn't bounced out to a browser.
        .plugin(tauri_plugin_upload::init())
        .run(tauri::generate_context!())
        .expect("error while running MSec");
}
