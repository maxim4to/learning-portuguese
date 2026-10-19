import { useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Cloud, Download, HardDrive, Monitor, Moon, Sun, Trash2, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/PageHeader'
import { useToast } from '@/components/toastContext'
import { PageSkeleton } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Switch } from '@/components/Switch'
import { setThemePref, useThemePref, type ThemePref } from '@/app/theme'
import { isFirebaseConfigured, useAuth, useRepository } from '@/data'
import { WORD_CARD_MODES, type Settings, type WordCardMode } from '@/data/types.ts'
import { getPtPtVoices, pickPtPtVoice, speak } from '@/engine/audio'
import { activityDays, computeStreak } from '@/features/dashboard/stats'
import { plural } from '@/features/library/format'
import { setLookupOnTapPref } from '@/features/words/capture/store'
import { MODE_UNLOCK_HINT, WORD_MODE_LABEL } from '@/features/words/status'
import { WordsContext } from '@/features/words/useWords'

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

  // Word capture reads the tap setting live (no reload needed after toggling / importing).
  const lookupOnTap = settings?.lookupOnTap
  useEffect(() => {
    if (lookupOnTap !== undefined) setLookupOnTapPref(lookupOnTap)
  }, [lookupOnTap])

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

  const navigate = useNavigate()
  const toast = useToast()
  const words = useContext(WordsContext) // optional: reload the dictionary cache after a reset

  /** Card modes switched: save, then suspend the switched-off modes' cards / resume the switched-on ones. */
  function changeWordModes(next: WordCardMode[]) {
    const prev = settings?.wordModes ?? []
    const changed = WORD_CARD_MODES.filter((m) => prev.includes(m) !== next.includes(m))
    update({ wordModes: next })
    if (!words || !changed.length) return
    const on = changed.filter((m) => next.includes(m))
    const names = (ms: WordCardMode[]) => ms.map((m) => `«${WORD_MODE_LABEL[m]}»`).join(', ')
    words.actions
      .applyEnabledModes(next, changed)
      .then(() =>
        toast({
          text: on.length
            ? `Карточки ${names(on)} снова в повторении`
            : `Карточки ${names(changed)} приостановлены, прогресс сохранён`,
        }),
      )
      .catch((e: unknown) => toast({ text: `Не удалось обновить карточки: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' }))
  }
  const [resetOpen, setResetOpen] = useState(false)

  async function handleReset(resetSettings: boolean) {
    flush() // a pending settings write must not resurrect anything after the reset
    await repo.resetProgress({ resetSettings })
    await words?.actions.reload()
    setResetOpen(false)
    toast({ text: resetSettings ? 'Прогресс и настройки сброшены' : 'Прогресс сброшен', tone: 'success' })
    navigate('/', { replace: true })
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
    <div className="page">
      <PageHeader title="Настройки" />

      <div className="space-y-(--gutter) md:space-y-(--space-section) lg:space-y-(--gutter)">

      <Section title="Оформление" description="Светлая, тёмная или как в системе. Выбор хранится на этом устройстве.">
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
          <Section title="Аудио" description="Голос и скорость для всех кнопок «Прослушать»: в уроках, диалогах, карточках и тексте для чтения.">
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
                  className="btn-secondary btn-sm max-sm:btn-icon"
                  onClick={() => void speak(SAMPLE, { voice: settings.voice, rate: settings.rate })}
                >
                  <Volume2 aria-hidden /> <span className="max-sm:sr-only">Прослушать</span>
                </button>
              </div>
            </Row>
            {/* Speed: label and the quick picks share a line, the slider runs under them. */}
            <div className="space-y-1">
              <div className="flex max-w-md flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <label htmlFor={rateId} className="text-sm font-semibold text-ink-muted">
                  Скорость: {fmtRate(settings.rate)}
                </label>
                <SegmentedControl
                  label="Быстрый выбор скорости"
                  size="sm"
                  value={[0.75, 1, 1.25].includes(settings.rate) ? String(settings.rate) : ''}
                  onChange={(v) => update({ rate: Number(v) })}
                  options={[0.75, 1, 1.25].map((r) => ({ value: String(r), label: fmtRate(r) }))}
                />
              </div>
              <input
                id={rateId}
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.rate}
                onChange={(e) => update({ rate: Number(e.target.value) })}
                className="range block w-full max-w-md"
                style={fill(settings.rate, 0.5, 1.5)}
                list="rate-marks"
                aria-valuetext={fmtRate(settings.rate)}
              />
              <datalist id="rate-marks">
                {RATES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            {voiceInfo && <p className="text-sm text-ink-muted">{voiceInfo}</p>}
          </Section>

          <Section title="Обучение" description="Как проверяются ответы в упражнениях и сколько новых карточек приходит в повторение за день.">
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
              <div className="flex max-w-md items-center gap-3">
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

          <Section
            title="Словарь"
            description="Как сохраняются и повторяются слова из «Моего словаря». Карточки слова открываются по очереди."
          >
            <Switch
              checked={settings.lookupOnTap}
              onChange={(v) => update({ lookupOnTap: v })}
              label="Перевод по нажатию на слово"
              description="Нажатие на слово в португальском тексте открывает перевод и «в словарь». Двойной клик, выделение и поиск «/» работают всегда."
            />
            <Switch
              checked={settings.typeWordAnswers}
              onChange={(v) => update({ typeWordAnswers: v })}
              label="Вводить ответ в карточках слов"
              description={
                <>
                  RU → PT, «На слух» и «Пропуск в предложении»: слово печатается и проверяется (с учётом настройки акцентов),
                  оценка предлагается по ответу. Выключено — карточка просто переворачивается.
                </>
              }
            />
            {/* highlightSavedWords stays in Settings; its switch returns with saved-word highlighting (phase 5). */}
            <WordModesField value={settings.wordModes} onChange={changeWordModes} />
          </Section>
        </>
      )}

      <Section title="Синхронизация" description="Где хранится прогресс и как его не потерять.">
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
                  <button className="btn-secondary btn-sm shrink-0" onClick={() => void copyUid(auth.user!.uid)}>
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

      <Section title="Резервная копия" description="Прогресс, карточки, журнал ошибок и настройки — в одном JSON-файле. Им же можно перенести данные в другой браузер.">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void handleExport()}>
            <Download aria-hidden /> Сохранить копию
          </button>
          <button ref={importBtnRef} className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden /> Восстановить из файла
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

      <Section title="Опасная зона" description="Необратимые действия с данными. Перед ними стоит сохранить резервную копию.">
        <LegacyWordCards />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">Сбросить весь прогресс</p>
            <p className="measure text-sm text-ink-muted">
              Удалит уроки и тесты, карточки повторения, словарь, журнал ошибок, диагностику и серию
              {repo.kind === 'firestore' ? ' — в аккаунте, на всех устройствах' : ' на этом устройстве'}. Настройки
              останутся, если не выбрать иное.
            </p>
          </div>
          <Button variant="danger" icon={<Trash2 />} className="shrink-0 self-start" onClick={() => setResetOpen(true)}>
            Сбросить…
          </Button>
        </div>
      </Section>
      </div>

      {/* Mounted only while open: every opening starts from a blank confirmation. */}
      {resetOpen && <ResetDialog onClose={() => setResetOpen(false)} onExport={handleExport} onReset={handleReset} />}
    </div>
  )
}

/** Card modes enabled for every dictionary word (at least one stays on). */
function WordModesField({ value, onChange }: { value: readonly WordCardMode[]; onChange(v: WordCardMode[]): void }) {
  const hintId = useId()
  return (
    <fieldset className="space-y-1" aria-describedby={hintId}>
      <legend className="mb-1 font-semibold">Виды карточек слова</legend>
      <p id={hintId} className="pb-1 text-sm text-ink-muted">
        До четырёх карточек на слово. Выключенный вид не создаётся, а уже созданные карточки приостанавливаются — прогресс
        сохраняется и вернётся при включении.
      </p>
      {WORD_CARD_MODES.map((m) => {
        const on = value.includes(m)
        const last = on && value.length === 1
        return (
          <label key={m} className={`flex min-h-11 items-start gap-3 rounded-control px-2 py-2 ${last ? '' : 'cursor-pointer hover:bg-surface-2'}`}>
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              checked={on}
              disabled={last}
              onChange={(e) => onChange(WORD_CARD_MODES.filter((x) => (x === m ? e.target.checked : value.includes(x))))}
            />
            <span className="min-w-0">
              <span className="block font-semibold">{WORD_MODE_LABEL[m]}</span>
              <span className="block text-sm text-ink-muted">
                {last ? 'хотя бы один вид остаётся включённым' : MODE_UNLOCK_HINT[m].replace(/^./, (c) => c.toLocaleUpperCase('ru-RU'))}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/**
 * One-time cleanup (decision 2): word cards made by the old «в повторение» buttons of themes,
 * situations and reading glossaries (`w:*`, `g:*`). Phrases and grammar stay. Hidden when there are none.
 */
function LegacyWordCards() {
  const words = useContext(WordsContext)
  const toast = useToast()
  const [count, setCount] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    if (done !== null) doneRef.current?.focus() // the dialog and its opener are gone: land on the result
  }, [done])

  useEffect(() => {
    let alive = true
    words?.actions
      .countLegacyWordCards()
      .then((n) => alive && setCount(n))
      .catch(() => alive && setCount(0))
    return () => {
      alive = false
    }
  }, [words])

  if (done !== null) {
    return (
      <p ref={doneRef} tabIndex={-1} className="border-b border-line pb-5 text-sm text-ink-muted outline-none">
        Старые карточки слов удалены: {done}. Слова добавляются в «Мой словарь» кнопкой «в словарь».
      </p>
    )
  }
  if (!words || !count) return null

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const n = await words!.actions.deleteLegacyWordCards()
      setOpen(false)
      setDone(n)
      toast({ text: `Удалено старых карточек слов: ${n}`, tone: 'success' })
    } catch (e) {
      setError(`Не удалось удалить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">Удалить старые карточки слов</p>
        <p className="measure text-sm text-ink-muted">
          {plural(count, 'карточка', 'карточки', 'карточек')} слов из тем, ситуаций и текстов, добавленных кнопкой «в
          повторение» до появления словаря. Фразы, грамматика и слова из «Моего словаря» останутся.
        </p>
      </div>
      <Button variant="danger" icon={<Trash2 />} className="shrink-0 self-start" onClick={() => setOpen(true)}>
        Удалить…
      </Button>
      {open && (
        <Dialog
          open
          role="alertdialog"
          onClose={() => !busy && setOpen(false)}
          initialFocusRef={cancelRef}
          title="Удалить старые карточки слов?"
          description={
            <>
              Будет удалено {plural(count, 'карточка', 'карточки', 'карточек')} вместе с прогрессом повторения. Отменить
              это нельзя. Нужные слова можно снова добавить кнопкой «в словарь» — в темах и ситуациях.
            </>
          }
          actions={
            <>
              <Button ref={cancelRef} variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Отмена
              </Button>
              <Button variant="danger" icon={<Trash2 />} onClick={() => void run()} disabled={busy}>
                {busy ? 'Удаляю…' : `Удалить ${count}`}
              </Button>
            </>
          }
        >
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </div>
  )
}

const CONFIRM_WORD = 'СБРОСИТЬ'

interface ResetCounts {
  topics: number
  results: number
  cards: number
  words: number
  errors: number
  diagnostics: number
  lastDiagnosticAt?: number
  streak: number
}

/** «Сбросить весь прогресс?»: what goes (with counts), backup first, optional settings reset, typed confirmation. */
function ResetDialog({
  onClose,
  onExport,
  onReset,
}: {
  onClose(): void
  onExport(): Promise<void>
  onReset(resetSettings: boolean): Promise<void>
}) {
  const repo = useRepository()
  const [counts, setCounts] = useState<ResetCounts | null>(null)
  const [typed, setTyped] = useState('')
  const [alsoSettings, setAlsoSettings] = useState(false)
  const [exported, setExported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()

  useEffect(() => {
    let alive = true
    void Promise.all([repo.getAllProgress(), repo.getCards(), repo.getErrors(), repo.getWords(), repo.getSettings()])
      .then(([progress, cards, errors, words, settings]) => {
        if (!alive) return
        let results = 0
        let diagnostics = 0
        for (const p of progress) for (const r of p.history) {
          if (r.source === 'diagnostic') diagnostics++
          else results++
        }
        setCounts({
          topics: progress.length,
          results,
          cards: cards.length,
          words: words.length,
          errors: errors.length,
          diagnostics,
          lastDiagnosticAt: settings.lastDiagnosticAt,
          streak: computeStreak(activityDays(progress, cards, errors)).streak,
        })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [repo])

  const confirmed = typed.trim().toLocaleUpperCase('ru-RU') === CONFIRM_WORD

  async function submit() {
    if (!confirmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onReset(alsoSettings)
    } catch (e) {
      setError(`Не удалось сбросить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const n = (v: number | undefined, one: string, few: string, many: string) => (counts ? plural(v ?? 0, one, few, many) : '…')
  const diag = !counts
    ? '…'
    : counts.lastDiagnosticAt
      ? `последняя ${new Date(counts.lastDiagnosticAt).toLocaleDateString('ru-RU')}`
      : counts.diagnostics
        ? plural(counts.diagnostics, 'результат', 'результата', 'результатов')
        : 'нет'
  const items: [string, string][] = [
    ['Уроки и тесты', counts ? `${n(counts.topics, 'тема', 'темы', 'тем')}, ${n(counts.results, 'результат', 'результата', 'результатов')}` : '…'],
    ['Карточки повторения', n(counts?.cards, 'карточка', 'карточки', 'карточек')],
    ['Словарь', n(counts?.words, 'слово', 'слова', 'слов')],
    ['Журнал ошибок', n(counts?.errors, 'запись', 'записи', 'записей')],
    ['Диагностика', diag],
    ['Серия', n(counts?.streak, 'день', 'дня', 'дней')],
  ]

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      role="alertdialog"
      initialFocusRef={inputRef}
      title="Сбросить весь прогресс?"
      description={
        <>
          Будет удалено {repo.kind === 'firestore' ? 'в аккаунте — на всех устройствах' : 'на этом устройстве'}. Отменить
          это нельзя.
        </>
      }
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="danger" icon={<Trash2 />} disabled={!confirmed || busy} onClick={() => void submit()}>
            {busy ? 'Сбрасываю…' : 'Сбросить прогресс'}
          </Button>
        </>
      }
    >
      <ul className="card-sunken divide-y divide-line py-1 text-sm" aria-label="Что будет удалено" aria-busy={!counts}>
        {items.map(([label, value]) => (
          <li key={label} className="flex items-baseline justify-between gap-4 py-2">
            <span className="font-semibold">{label}</span>
            <span className="text-right text-ink-muted tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        Также очистятся черновики письма и незавершённые упражнения на этом устройстве. Тема оформления останется.
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          icon={exported ? <Check /> : <Download />}
          onClick={() => void onExport().then(() => setExported(true))}
        >
          Сначала скачать резервную копию
        </Button>
        {exported && (
          <span role="status" className="text-sm text-ink-muted">
            Копия сохранена
          </span>
        )}
      </div>

      <Switch
        checked={alsoSettings}
        onChange={setAlsoSettings}
        label="Также сбросить настройки"
        description="Голос, скорость, проверка ответов, лимит новых карточек и настройки словаря вернутся к исходным."
      />

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label htmlFor={inputId} className="block text-sm font-semibold">
          Чтобы подтвердить, введите «{CONFIRM_WORD}»
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={error ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          disabled={busy}
        />
        {error && (
          <p id={hintId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}

/**
 * Settings row (app-screens §8.2): from lg the section's name and what it controls sit in a left column,
 * its controls in a panel on the right — the page uses the full container width without stretching inputs.
 */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:gap-(--gutter) lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-1 md:pt-6">
        <h2 id={id}>{title}</h2>
        <p className="measure text-sm text-ink-muted">{description}</p>
      </div>
      <div className="card space-y-5">{children}</div>
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
