import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.tsx'

Sentry.init({
  dsn: "https://baa09bb83d994adda5c3ef2291d5d379@app.glitchtip.com/25972",
  tracesSampleRate: 0.01, // 1% of transactions — adjust to your needs
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
