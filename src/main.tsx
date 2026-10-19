import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import { initTheme } from './app/theme'

initTheme()

const root = createRoot(document.getElementById('root')!)

// The app (and the content loader, which validates all JSON at import time) is loaded
// dynamically so that invalid content shows a readable error instead of a blank page.
import('./app/App.tsx')
  .then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch((e: unknown) => {
    console.error(e)
    root.render(
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <h1 className="text-danger">Ошибка загрузки контента</h1>
        <pre className="overflow-x-auto rounded-control bg-danger-soft p-3 text-sm whitespace-pre-wrap text-danger">
          {e instanceof Error ? e.message : String(e)}
        </pre>
        <p className="text-sm text-ink-muted">Запустите `npm run validate` для подробностей.</p>
      </div>,
    )
  })
