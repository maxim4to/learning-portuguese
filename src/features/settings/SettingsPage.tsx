import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isFirebaseConfigured, useAuth, useRepository } from '@/data'
import type { Settings } from '@/data/types.ts'
import { getPtPtVoices, pickPtPtVoice, speak } from '@/engine/audio'

const SAMPLE = 'Bom dia! Hoje vamos praticar o português europeu.'
const RATES = [0.75, 0.85, 1, 1.15, 1.25]

export function SettingsPage() {
  const repo = useRepository()
  const auth = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)

  useEffect(() => {
    void repo.getSettings().then(setSettings)
  }, [repo])

  useEffect(() => {
    if (!settings) return
    let cancelled = false
    void Promise.all([getPtPtVoices(), pickPtPtVoice(settings.voice)]).then(([all, v]) => {
      if (cancelled) return
      setVoiceInfo(
        all.length
          ? `Голос браузера: ${v?.name ?? '—'} (доступно pt-PT: ${all.length}). Заранее записанное аудио звучит одинаково на всех устройствах.`
          : 'На этом устройстве нет голоса pt-PT для синтеза речи — будет играть только заранее записанное аудио.',
      )
    })
    return () => {
      cancelled = true
    }
  }, [settings])

  // Optimistic local update; writes are debounced (sliders fire many events, Firestore counts writes).
  const pending = useRef<Partial<Settings>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) void repo.saveSettings(patch)
  }, [repo])
  useEffect(() => flush, [flush])

  function update(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }

  async function handleExport() {
    const bundle = await repo.exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portugues-pt-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    // Revoking synchronously can cancel the download in Safari (iOS PWA) — let it start first.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function handleImport(file: File) {
    setPendingImport(null)
    try {
      await repo.importAll(await file.text())
      setSettings(await repo.getSettings())
      setMessage('Импорт выполнен')
    } catch (e) {
      setMessage(`Ошибка импорта: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function copyUid(uid: string) {
    try {
      await navigator.clipboard.writeText(uid)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1>Настройки</h1>

      <section className="card space-y-4">
        <h2>Аудио</h2>
        {!settings ? (
          <p className="text-stone-500">Загрузка…</p>
        ) : (
          <>
            <Row label="Голос">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={settings.voice}
                  options={[
                    { value: 'female', label: 'Женский' },
                    { value: 'male', label: 'Мужской' },
                  ]}
                  onChange={(voice) => update({ voice })}
                />
                <button
                  className="btn-secondary px-3 py-1.5 text-sm"
                  onClick={() => void speak(SAMPLE, { voice: settings.voice, rate: settings.rate })}
                >
                  🔊 Прослушать
                </button>
              </div>
            </Row>
            <Row label={`Скорость: ${Number(settings.rate.toFixed(2))}×`}>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.rate}
                onChange={(e) => update({ rate: Number(e.target.value) })}
                className="w-full accent-brand-700"
                list="rate-marks"
                aria-label="Скорость воспроизведения"
              />
              <datalist id="rate-marks">
                {RATES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <div className="mt-1 flex gap-1.5">
                {[0.75, 1, 1.25].map((r) => (
                  <button
                    key={r}
                    onClick={() => update({ rate: r })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${settings.rate === r ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300 dark:border-stone-700'}`}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </Row>
            {voiceInfo && <p className="text-xs text-stone-500">{voiceInfo}</p>}
          </>
        )}
      </section>

      {settings && (
        <section className="card space-y-4">
          <h2>Обучение</h2>
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block font-medium">Не учитывать ошибки в акцентах</span>
              <span className="block text-sm text-stone-500">«voce» вместо «você» засчитывается как верный ответ</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.lenientAccents}
              onChange={(e) => update({ lenientAccents: e.target.checked })}
              className="mt-1 size-5 shrink-0 accent-brand-700"
            />
          </label>
          <Row label="Новых карточек в день">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={settings.newCardsPerDay}
                onChange={(e) => update({ newCardsPerDay: Number(e.target.value) })}
                className="flex-1 accent-brand-700"
                aria-label="Новых карточек в день"
              />
              <input
                type="number"
                min={0}
                max={200}
                value={settings.newCardsPerDay}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(200, Math.round(Number(e.target.value) || 0)))
                  update({ newCardsPerDay: n })
                }}
                className="input w-20 py-1.5 text-center"
                aria-label="Новых карточек в день (число)"
              />
            </div>
          </Row>
          {settings.lastDiagnosticAt && (
            <p className="text-sm text-stone-500">
              Последняя диагностика: {new Date(settings.lastDiagnosticAt).toLocaleDateString('ru-RU')}
            </p>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <h2>Синхронизация</h2>
        <p className="text-sm text-stone-500">
          Хранилище: <b className="font-mono text-stone-700 dark:text-stone-300">{repo.kind}</b>
          {repo.kind === 'local' ? ' — только этот браузер' : ' — Firestore, синхронизируется между устройствами'}
        </p>
        {isFirebaseConfigured ? (
          auth.user ? (
            <>
              <p>
                Вы вошли как <b>{auth.user.email ?? auth.user.displayName}</b>.
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm dark:bg-stone-800">
                    {auth.user.uid}
                  </code>
                  <button className="btn-secondary shrink-0 px-3 py-1.5 text-sm" onClick={() => void copyUid(auth.user!.uid)}>
                    {copied ? 'Скопировано' : 'Скопировать UID'}
                  </button>
                </div>
                <p className="text-xs text-stone-500">
                  Email: <b>{auth.user.email ?? '—'}</b>. Доступ к данным разрешён для email, указанного в{' '}
                  <code>firestore.rules</code> (<code>ALLOWED_EMAIL</code>)
                </p>
              </div>
              <button className="btn-secondary" onClick={() => void auth.signOut()}>
                Выйти
              </button>
            </>
          ) : (
            <p className="text-stone-600 dark:text-stone-400">Firebase подключён, вход не выполнен.</p>
          )
        ) : (
          <p className="text-stone-600 dark:text-stone-400">
            Firebase не настроен — прогресс хранится только в этом браузере. Заполните VITE_FIREBASE_* в .env, чтобы
            включить синхронизацию.
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2>Резервная копия</h2>
        <p className="text-sm text-stone-500">Прогресс, карточки, журнал ошибок и настройки в одном JSON-файле.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void handleExport()}>
            Экспорт JSON
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            Импорт JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setMessage(null)
                setPendingImport(f)
              }
              e.target.value = ''
            }}
          />
        </div>
        {pendingImport && (
          <div
            role="alertdialog"
            aria-labelledby="import-confirm-title"
            className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-900/20"
          >
            <p id="import-confirm-title" className="font-medium">
              Импортировать «{pendingImport.name}»?
            </p>
            <p className="text-stone-700 dark:text-stone-300">
              Данные из файла будут объединены с текущими: прогресс по темам, карточки и записи журнала ошибок с
              совпадающими идентификаторами будут перезаписаны версиями из файла, остальные текущие данные сохранятся.
              Настройки будут полностью заменены настройками из файла. Отменить импорт нельзя — при необходимости
              сначала сделайте экспорт.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => void handleImport(pendingImport)}>
                Импортировать
              </button>
              <button className="btn-secondary" onClick={() => setPendingImport(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-sm">{message}</p>}
      </section>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-stone-600 dark:text-stone-300">{label}</div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange(v: T): void
}) {
  return (
    <div className="inline-flex rounded-xl border border-stone-300 p-0.5 dark:border-stone-700" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1 text-sm ${value === o.value ? 'bg-brand-700 text-white' : 'text-stone-600 dark:text-stone-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
