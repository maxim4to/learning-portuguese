import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

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
        <h1 className="text-red-700">Ошибка загрузки контента</h1>
        <pre className="overflow-x-auto rounded-xl bg-red-50 p-3 text-sm whitespace-pre-wrap text-red-900 dark:bg-red-950 dark:text-red-100">
          {e instanceof Error ? e.message : String(e)}
        </pre>
        <p className="text-sm text-stone-500">Запустите `npm run validate` для подробностей.</p>
      </div>,
    )
  })
