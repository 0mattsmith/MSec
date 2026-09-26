// MSec extension configuration.
//
// FIREBASE_* values match firebase-applet-config.json in the main app.
//
// OAUTH_CLIENT_ID: one-time setup — create an OAuth 2.0 "Web application"
// client in Google Cloud Console (same project), and add BOTH redirect URIs:
//   Chrome:  https://<your-chrome-extension-id>.chromiumapp.org/
//   Firefox: the URL printed by the popup's "Show redirect URI" link
// then paste the client ID here.
const MSEC_CONFIG = {
  FIREBASE_API_KEY: "AIzaSyCwa-xwhDYAkw_7RkB38v9hlaeRpMHYuWA",
  FIREBASE_PROJECT_ID: "m--sec",
  FIRESTORE_DATABASE_ID: "(default)",
  OAUTH_CLIENT_ID: "PASTE_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  AUTO_LOCK_MINUTES: 10
};
