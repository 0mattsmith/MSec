import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Native (Tauri) builds draw edge-to-edge; mark them so the stylesheet can
// guarantee padding for the status bar and gesture bar.
if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) {
  document.documentElement.classList.add('msec-native');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: register the service worker (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}
