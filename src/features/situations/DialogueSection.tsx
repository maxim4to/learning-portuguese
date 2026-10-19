import { useEffect, useRef, useState } from 'react'
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
      lineRefs.current[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => (running ? stopAll() : void playAll())}
          aria-pressed={running}
        >
          <span aria-hidden>{running ? '■' : '▶'}</span> {running ? 'Остановить' : 'Прослушать весь диалог'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          aria-pressed={!showRu}
          onClick={() => {
            setShowRu((v) => !v)
            setRuOverride(new Map())
          }}
        >
          {showRu ? 'Скрыть перевод' : 'Показать перевод'}
        </button>
        <button type="button" className="btn-secondary" aria-pressed={roleplay} onClick={toggleRoleplay}>
          {roleplay ? '✓ Ролевая игра' : '🎭 Режим ролевой игры'}
        </button>
      </div>

      {unavailable && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          На этом устройстве нет голоса pt-PT — аудио недоступно.
        </p>
      )}

      {roleplay && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-50/70 p-3 text-sm text-stone-700 dark:bg-brand-800/20 dark:text-stone-300">
          Вы — <b>B</b>. Ваши реплики скрыты: прочитайте подсказку, скажите фразу вслух по-португальски и нажмите
          «Показать», чтобы сверить. При прослушивании всего диалога воспроизведение остановится на вашей реплике
          (Enter или пробел — показать и продолжить).
          {hiddenCount > 0 && (
            <button
              type="button"
              className="mt-2 block text-brand-700 underline dark:text-brand-500"
              onClick={() => setRevealed(new Set(lines.map((_, i) => i)))}
            >
              Показать все мои реплики ({hiddenCount})
            </button>
          )}
        </div>
      )}

      <ol className="space-y-2">
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
              className={`flex scroll-mt-28 gap-2.5 sm:gap-3 ${isB ? 'flex-row-reverse text-right' : ''}`}
            >
              <span
                aria-label={isB ? 'Собеседник B' : 'Собеседник A'}
                className={`mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isB ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' : 'bg-brand-100 text-brand-800 dark:bg-brand-800/50 dark:text-brand-100'
                }`}
              >
                {line.speaker}
              </span>
              <div
                className={`min-w-0 max-w-[85%] rounded-2xl border px-3.5 py-2.5 transition sm:max-w-[75%] ${
                  isActive ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-stone-200 dark:border-stone-800'
                } ${isB ? 'rounded-tr-sm bg-sky-50/70 dark:bg-sky-950/30' : 'rounded-tl-sm bg-white dark:bg-stone-900'}`}
              >
                {isHidden ? (
                  <div className="space-y-2">
                    <p className="text-sm text-stone-500">
                      {waiting === i ? '🎙 Ваша очередь — скажите вслух:' : 'Ваша реплика:'}
                    </p>
                    <p className="font-medium text-stone-800 dark:text-stone-200">{line.ru}</p>
                    <button
                      type="button"
                      className="btn-secondary min-h-9 px-3 py-1 text-sm"
                      id={`dlg-reveal-${i}`}
                      onClick={() => reveal(i)}
                    >
                      Показать
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[17px] leading-snug font-medium" lang="pt-PT">
                      {line.pt}
                    </p>
                    {ruShown(i) && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{line.ru}</p>}
                    <div className={`mt-1.5 flex items-center gap-1.5 ${isB ? 'justify-end' : ''}`}>
                      <button
                        type="button"
                        onClick={() => void playLine(i)}
                        aria-label={isActive && !running ? 'Остановить' : `Прослушать реплику ${i + 1}`}
                        className="inline-flex size-9 items-center justify-center rounded-full border border-brand-600/30 bg-brand-50 text-brand-800 hover:bg-brand-100 active:scale-95 dark:border-brand-500/30 dark:bg-brand-800/30 dark:text-brand-100 dark:hover:bg-brand-800/60"
                      >
                        <span aria-hidden>{isActive && !running ? '■' : '▶'}</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={ruShown(i)}
                        onClick={() => setRuOverride((m) => new Map(m).set(i, !ruShown(i)))}
                        className="inline-flex h-9 items-center rounded-full px-2.5 text-xs font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        {ruShown(i) ? 'скрыть RU' : 'RU'}
                      </button>
                    </div>
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
