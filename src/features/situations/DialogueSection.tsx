import { useEffect, useRef, useState } from 'react'
import { Drama, Eye, Languages, Mic, Play, Square } from 'lucide-react'
import { cx, scrollBehavior } from '@/components/cx'
import type { DialogueLine, Situation } from '@/content'
import type { VoiceGender } from '@/engine/audio'
import { useSpeak } from '@/features/exercises'

/** Dialogue voices: A — female (staff, official…), B — male (the learner's role). */
const SPEAKER_VOICE: Record<DialogueLine['speaker'], VoiceGender> = { A: 'female', B: 'male' }

const PAUSE_MS = 450
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Dialogue: per-line play (speaker's voice), «Прослушать весь диалог» (sequential),
 * translation toggles, role-play (B lines hidden; learner says them, then reveals).
 */
export function DialogueSection({ situation }: { situation: Situation }) {
  const lines = situation.dialogue
  const { speak, stop, unavailable } = useSpeak()
  const [showRu, setShowRu] = useState(true)
  /** Per-line translation overrides (line index → shown). Cleared by the global toggle. */
  const [ruOverride, setRuOverride] = useState<Map<number, boolean>>(new Map())
  const [roleplay, setRoleplay] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  /** Line currently playing (or awaiting the learner in role-play). */
  const [active, setActive] = useState<number | null>(null)
  const [waiting, setWaiting] = useState<number | null>(null)
  const [running, setRunning] = useState(false)

  const run = useRef(0)
  const resume = useRef<(() => void) | null>(null)
  const lineRefs = useRef<(HTMLLIElement | null)[]>([])

  const hidden = (i: number) => roleplay && lines[i].speaker === 'B' && !revealed.has(i)
  const ruShown = (i: number) => ruOverride.get(i) ?? showRu

  function cancel() {
    run.current++
    resume.current?.()
    resume.current = null
    setRunning(false)
    setActive(null)
    setWaiting(null)
  }

  function stopAll() {
    cancel()
    stop()
  }

  // Stop the sequence when leaving the page.
  useEffect(() => () => void run.current++, [])

  async function playLine(i: number) {
    if (active === i && !running) {
      stopAll()
      return
    }
    cancel()
    const my = run.current
    setActive(i)
    await speak(lines[i].pt, 1, SPEAKER_VOICE[lines[i].speaker])
    if (run.current === my) setActive(null)
  }

  async function playAll(from = 0) {
    cancel()
    const my = run.current
    setRunning(true)
    for (let i = from; i < lines.length; i++) {
      if (run.current !== my) return
      setActive(i)
      lineRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
      if (roleplay && lines[i].speaker === 'B' && !revealed.has(i)) {
        // Learner's turn: wait for «Показать», then play the line for comparison.
        setWaiting(i)
        await new Promise<void>((r) => (resume.current = r))
        if (run.current !== my) return
        setWaiting(null)
        setRevealed((s) => new Set(s).add(i))
      }
      const src = await speak(lines[i].pt, 1, SPEAKER_VOICE[lines[i].speaker])
      if (run.current !== my) return
      if (src === 'none') break
      if (i < lines.length - 1) await wait(PAUSE_MS)
    }
    if (run.current === my) {
      setRunning(false)
      setActive(null)
    }
  }

  function reveal(i: number) {
    // «Показать» unmounts with the hidden line: keep focus on the revealed line instead of <body>.
    requestAnimationFrame(() => document.getElementById(`dlg-line-${i}`)?.focus({ preventScroll: true }))
    if (waiting === i && resume.current) {
      const r = resume.current
      resume.current = null
      r()
      return
    }
    setRevealed((s) => new Set(s).add(i))
  }

  function toggleRoleplay() {
    stopAll()
    setRoleplay((v) => !v)
    setRevealed(new Set())
  }

  // Role-play turn: move focus to «Показать» so Enter/Space reveal and continue.
  useEffect(() => {
    if (waiting !== null) document.getElementById(`dlg-reveal-${waiting}`)?.focus({ preventScroll: true })
  }, [waiting])

  // Keyboard: Space/Enter reveal the awaited line in role-play (when focus isn't on a control).
  useEffect(() => {
    if (waiting === null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'BUTTON', 'A', 'SELECT'].includes(t.tagName)) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        reveal(waiting)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hiddenCount = roleplay ? lines.filter((l, i) => l.speaker === 'B' && !revealed.has(i)).length : 0

  const toggle = (on: boolean) =>
    cx(
      'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors',
      on ? 'border-transparent bg-ink text-bg' : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
    )

  return (
    <div className="space-y-4">
      {/* One compact toolbar: play all · translation · role-play (audit P1-11). */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Диалог">
        {/* Toggles are icon-only below 420px; their names stay in aria-label. */}
        <button
          type="button"
          className="btn-primary"
          onClick={() => (running ? stopAll() : void playAll())}
          aria-pressed={running}
        >
          {running ? <Square aria-hidden className="size-4.5 fill-current" /> : <Play aria-hidden className="size-4.5 fill-current" />}
          {running ? 'Стоп' : 'Весь диалог'}
        </button>
        <button
          type="button"
          className={toggle(showRu)}
          aria-pressed={showRu}
          aria-label="Перевод"
          onClick={() => {
            setShowRu((v) => !v)
            setRuOverride(new Map())
          }}
        >
          <Languages aria-hidden className="size-4.5" /> <span aria-hidden className="hidden min-[420px]:inline">Перевод</span>
        </button>
        <button type="button" className={toggle(roleplay)} aria-pressed={roleplay} aria-label="Ролевая игра: вы — B" onClick={toggleRoleplay}>
          <Drama aria-hidden className="size-4.5" /> <span aria-hidden className="hidden min-[420px]:inline">Роль B</span>
        </button>
      </div>

      {unavailable && <p className="text-sm text-warning">На этом устройстве нет голоса pt-PT — аудио недоступно.</p>}

      {roleplay && (
        <div className="animate-enter rounded-control border border-terracotta/30 bg-terracotta-soft p-3 text-sm text-ink">
          Вы — <b>B</b>. Ваши реплики скрыты: прочитайте подсказку, скажите фразу вслух по-португальски и нажмите
          «Показать», чтобы сверить. При прослушивании всего диалога воспроизведение остановится на вашей реплике
          (Enter или пробел — показать и продолжить).
          {hiddenCount > 0 && (
            <button
              type="button"
              className="mt-1 block min-h-11 font-semibold text-terracotta underline underline-offset-2"
              onClick={() => {
                const first = lines.findIndex((l, i) => l.speaker === 'B' && !revealed.has(i))
                setRevealed(new Set(lines.map((_, i) => i)))
                // This button disappears once nothing is hidden: focus the first revealed line.
                requestAnimationFrame(() => document.getElementById(`dlg-line-${first}`)?.focus({ preventScroll: true }))
              }}
            >
              Показать все мои реплики ({hiddenCount})
            </button>
          )}
        </div>
      )}

      {!roleplay && <p className="text-xs text-ink-muted">Нажмите на реплику, чтобы показать или скрыть перевод.</p>}

      <ol className="space-y-3">
        {lines.map((line, i) => {
          const isB = line.speaker === 'B'
          const isHidden = hidden(i)
          const isActive = active === i
          return (
            <li
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              className={cx('flex scroll-mt-28 items-end gap-2 sm:gap-3', isB && 'flex-row-reverse')}
            >
              <span
                aria-label={isB ? 'Собеседник B' : 'Собеседник A'}
                className={cx(
                  'mb-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                  isB ? 'bg-terracotta-soft text-terracotta' : 'bg-azulejo-soft text-azulejo-ink',
                )}
              >
                {line.speaker}
              </span>
              <div
                className={cx(
                  'flex min-w-0 max-w-[85%] items-start gap-1 rounded-card border py-2 pr-1.5 pl-3.5 shadow-card transition-[border-color,box-shadow] sm:max-w-[75%]',
                  isActive ? 'border-azulejo ring-2 ring-azulejo/30' : 'border-line',
                  isB ? 'rounded-br-sm bg-surface-2' : 'rounded-bl-sm bg-surface',
                )}
              >
                {isHidden ? (
                  <div className="space-y-2 py-0.5 pr-2">
                    <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                      {waiting === i && <Mic aria-hidden className="size-4 text-terracotta" />}
                      {waiting === i ? 'Ваша очередь — скажите вслух:' : 'Ваша реплика:'}
                    </p>
                    <p className="font-semibold">{line.ru}</p>
                    <button
                      type="button"
                      className="btn-secondary min-h-10 px-3 text-sm"
                      id={`dlg-reveal-${i}`}
                      onClick={() => reveal(i)}
                    >
                      <Eye aria-hidden className="size-4" /> Показать
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      id={`dlg-line-${i}`}
                      className="min-w-0 flex-1 cursor-pointer py-0.5 text-left"
                      aria-expanded={ruShown(i)}
                      onClick={() => setRuOverride((m) => new Map(m).set(i, !ruShown(i)))}
                    >
                      <span className="block text-[1.0625rem] leading-snug font-semibold" lang="pt-PT">
                        {line.pt}
                      </span>
                      {ruShown(i) ? (
                        <span className="mt-0.5 block text-sm text-ink-muted">{line.ru}</span>
                      ) : (
                        <span className="sr-only">Показать перевод</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void playLine(i)}
                      aria-label={isActive && !running ? 'Остановить' : `Прослушать реплику ${i + 1}`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-azulejo transition-colors hover:bg-azulejo-soft active:scale-95"
                    >
                      {isActive ? <Square aria-hidden className="size-4 fill-current" /> : <Play aria-hidden className="size-4.5 fill-current" />}
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
