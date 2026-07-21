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
  FIREBASE_API_KEY: "AIzaSyCBhuCjQC_h0-FAXMBz_3wIHw4CQHU0lyA",
  FIREBASE_PROJECT_ID: "golden-fountain-w6tp2",
  FIRESTORE_DATABASE_ID: "ai-studio-1df2f1e2-43f2-47f6-aed6-5f067420f398",
  OAUTH_CLIENT_ID: "PASTE_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  AUTO_LOCK_MINUTES: 10
};
