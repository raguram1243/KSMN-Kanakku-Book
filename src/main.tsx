import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { purgeIfSignedOut } from './lib/offlineCache'

// No session, no saved offline data.
purgeIfSignedOut()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)

// The offline shell (public/sw.js). Production only: in dev it would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app works without it; only offline start-up is lost.
    })
  })
}
