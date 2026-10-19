import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Cloud, Download, HardDrive, Monitor, Moon, Sun, Upload, Volume2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { setThemePref, useThemePref, type ThemePref } from '@/app/theme'
import { isFirebaseConfigured, useAuth, useRepository } from '@/data'
import type { Settings } from '@/data/types.ts'
import { getPtPtVoices, pickPtPtVoice, speak } from '@/engine/audio'

const SAMPLE = 'Bom dia! Hoje vamos praticar o português europeu.'
const RATES = [0.75, 0.85, 1, 1.15, 1.25]

export function SettingsPage() {
  const repo = useRepository()
  const auth = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const importBtnRef = useRef<HTMLButtonElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingImport, setPendingImport] = useState<File | null>(null)
  const theme = useThemePref()
  const rateId = useId()
  const newId = useId()

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
          ? `Голос браузера для запасного синтеза: ${v?.name ?? '—'}. Основное аудио записано заранее и звучит одинаково на всех устройствах.`
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
    importBtnRef.current?.focus() // the confirm (and its focused button) unmounts
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

  const fmtRate = (r: number) => `${r.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}×`
  const fill = (v: number, min: number, max: number) => ({ ['--fill' as string]: `${((v - min) / (max - min)) * 100}%` })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Настройки" />

      <Section title="Оформление">
        <Row label="Тема">
          <SegmentedControl<ThemePref>
            label="Тема оформления"
            value={theme}
            onChange={setThemePref}
            className="w-full sm:w-auto"
            options={[
              { value: 'system', label: <><Monitor aria-hidden className="size-4" /> Авто</>, ariaLabel: 'Как в системе' },
              { value: 'light', label: <><Sun aria-hidden className="size-4" /> Светлая</> },
              { value: 'dark', label: <><Moon aria-hidden className="size-4" /> Тёмная</> },
            ]}
          />
        </Row>
      </Section>

      {!settings ? (
        <PageSkeleton cards={2} />
      ) : (
        <>
          <Section title="Аудио">
            <Row label="Голос">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                  label="Голос"
                  value={settings.voice}
                  options={[
                    { value: 'female', label: 'Женский' },
                    { value: 'male', label: 'Мужской' },
                  ]}
                  onChange={(voice) => update({ voice })}
                />
                <button
                  className="btn-secondary px-3 text-sm"
                  onClick={() => void speak(SAMPLE, { voice: settings.voice, rate: settings.rate })}
                >
                  <Volume2 aria-hidden className="size-4.5 text-azulejo" /> Прослушать
                </button>
              </div>
            </Row>
            <Row label={`Скорость: ${fmtRate(settings.rate)}`} htmlFor={rateId}>
              <input
                id={rateId}
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.rate}
                onChange={(e) => update({ rate: Number(e.target.value) })}
                className="range w-full"
                style={fill(settings.rate, 0.5, 1.5)}
                list="rate-marks"
                aria-valuetext={fmtRate(settings.rate)}
              />
              <datalist id="rate-marks">
                {RATES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <SegmentedControl
                label="Быстрый выбор скорости"
                size="sm"
                value={[0.75, 1, 1.25].includes(settings.rate) ? String(settings.rate) : ''}
                onChange={(v) => update({ rate: Number(v) })}
                options={[0.75, 1, 1.25].map((r) => ({ value: String(r), label: fmtRate(r) }))}
              />
            </Row>
            {voiceInfo && <p className="text-sm text-ink-muted">{voiceInfo}</p>}
          </Section>

          <Section title="Обучение">
            <Switch
              checked={settings.lenientAccents}
              onChange={(v) => update({ lenientAccents: v })}
              label="Не учитывать ошибки в акцентах"
              description={
                <>
                  «voce» вместо «<span lang="pt-PT">você</span>» засчитывается как верный ответ
                </>
              }
            />
            <Row label="Новых карточек в день" htmlFor={newId}>
              <div className="flex items-center gap-3">
                <input
                  id={newId}
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={Math.min(50, settings.newCardsPerDay)}
                  onChange={(e) => update({ newCardsPerDay: Number(e.target.value) })}
                  className="range flex-1"
                  style={fill(Math.min(50, settings.newCardsPerDay), 0, 50)}
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
                  className="input w-20 text-center tabular-nums"
                  aria-label="Новых карточек в день, число"
                />
              </div>
            </Row>
            {settings.lastDiagnosticAt && (
              <p className="text-sm text-ink-muted">
                Последняя диагностика: {new Date(settings.lastDiagnosticAt).toLocaleDateString('ru-RU')}
              </p>
            )}
          </Section>
        </>
      )}

      <Section title="Синхронизация">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-2 text-ink-muted">
            {repo.kind === 'firestore' ? <Cloud className="size-5" /> : <HardDrive className="size-5" />}
          </span>
          <div className="space-y-1">
            {isFirebaseConfigured && auth.user ? (
              <>
                <p className="font-semibold">Прогресс синхронизируется с аккаунтом</p>
                <p className="text-sm text-ink-muted">{auth.user.email ?? auth.user.displayName}</p>
              </>
            ) : isFirebaseConfigured ? (
              <p className="font-semibold">Синхронизация доступна, вход не выполнен</p>
            ) : (
              <>
                <p className="font-semibold">Прогресс хранится на этом устройстве</p>
                <p className="text-sm text-ink-muted">
                  Чтобы не потерять его при смене браузера, время от времени сохраняйте резервную копию.
                </p>
              </>
            )}
          </div>
        </div>
        {isFirebaseConfigured && auth.user && (
          <button className="btn-secondary" onClick={() => void auth.signOut()}>
            Выйти
          </button>
        )}
        <details className="group rounded-control border border-line px-3 py-1 text-sm">
          <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-ink-muted select-none">Для разработчика</summary>
          <div className="space-y-2 pb-3 text-ink-muted">
            <p>
              Хранилище: <code className="font-mono text-ink">{repo.kind}</code>
              {!isFirebaseConfigured && <> · Firebase не настроен (VITE_FIREBASE_* в .env)</>}
            </p>
            {auth.user && (
              <>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 font-mono text-ink">{auth.user.uid}</code>
                  <button className="btn-secondary shrink-0 px-3 text-sm" onClick={() => void copyUid(auth.user!.uid)}>
                    {copied ? 'Скопировано' : 'Скопировать UID'}
                  </button>
                </div>
                <p>
                  Доступ к данным разрешён для email, указанного в <code>firestore.rules</code> (<code>ALLOWED_EMAIL</code>).
                </p>
              </>
            )}
          </div>
        </details>
      </Section>

      <Section title="Резервная копия">
        <p className="text-sm text-ink-muted">Прогресс, карточки, журнал ошибок и настройки — в одном файле.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void handleExport()}>
            <Download aria-hidden className="size-5" /> Сохранить копию
          </button>
          <button ref={importBtnRef} className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden className="size-5" /> Восстановить из файла
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
            className="animate-enter space-y-3 rounded-control border border-warning-line bg-warning-soft p-4 text-sm"
          >
            <p id="import-confirm-title" className="font-semibold">
              Восстановить из «{pendingImport.name}»?
            </p>
            <p>
              Данные из файла будут объединены с текущими: прогресс по темам, карточки и записи журнала ошибок с
              совпадающими идентификаторами будут перезаписаны версиями из файла, остальные текущие данные сохранятся.
              Настройки будут полностью заменены настройками из файла. Отменить это нельзя — при необходимости сначала
              сохраните копию.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => void handleImport(pendingImport)}>
                Восстановить
              </button>
              <button
                className="btn-secondary"
                autoFocus
                onClick={() => {
                  setPendingImport(null)
                  importBtnRef.current?.focus() // the confirm unmounts with this button
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-5 sm:p-6">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-muted">
          {label}
        </label>
      ) : (
        <div className="text-sm font-semibold text-ink-muted">{label}</div>
      )}
      {children}
    </div>
  )
}
