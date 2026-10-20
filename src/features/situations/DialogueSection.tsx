import { useEffect, useRef, useState } from 'react'
import { Drama, Eye, Languages, Mic, Play, Square } from 'lucide-react'
import { cx, scrollBehavior } from '@/components/cx'
import type { DialogueLine, Situation } from '@/content'
import type { VoiceGender } from '@/engine/audio'
import { useSpeak } from '@/features/exercises'
import { isLookupOpen } from '@/features/words/capture/store'
import { Pt } from '@/features/words/Pt'

/** Dialogue voices: A — female (staff, official…), B — male (the learner's role). */
const SPEAKER_VOICE: Record<DialogueLine['speaker'], VoiceGender> = { A: 'female', B: 'male' }

const PAUSE_MS = 450
/** «Показывать переводы» is remembered per device. */
const SHOW_RU_KEY = 'ptpt:v1:dialogue-show-ru'

function readShowRu(): boolean {
  try {
    return localStorage.getItem(SHOW_RU_KEY) !== '0'
  } catch {
    return true
  }
}
function writeShowRu(v: boolean) {
  try {
    localStorage.setItem(SHOW_RU_KEY, v ? '1' : '0')
  } catch {
    /* private mode: per session only */
  }
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Dialogue: per-line play (speaker's voice), «Прослушать весь диалог» (sequential),
 * translations (global «Показывать переводы» + a per-line 文A button), role-play (B lines hidden; learner says
 * them, then reveals). Line text is plain pt (<Pt>): a tap on a word opens the word lookup card.
 */
export function DialogueSection({ situation }: { situation: Situation }) {
  const lines = situation.dialogue
  const { speak, stop, unavailable } = useSpeak()
  const [showRu, setShowRu] = useState(readShowRu)
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
      if (isLookupOpen()) return // Enter / Space belong to the word card while it is open
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
      // Toggle buttons share the toolbar row with the primary, so they take the same md height (44px).
      'btn border-[1.5px] max-sm:btn-icon',
      on ? 'border-ink bg-ink text-bg' : 'border-line-strong bg-surface text-ink hover:border-ink',
    )

  return (
    <div className="space-y-4">
      {/* One compact toolbar: play all · translation · role-play (audit P1-11). */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Диалог">
        {/* Toggles are icon-only on phones (with labels the third one wrapped alone at 430px); names stay in aria-label. */}
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
          aria-label="Показывать переводы"
          onClick={() => {
            const next = !showRu
            setShowRu(next)
            writeShowRu(next)
            setRuOverride(new Map())
          }}
        >
          <Languages aria-hidden className="size-4.5" /> <span aria-hidden className="hidden sm:inline">Переводы</span>
        </button>
        <button type="button" className={toggle(roleplay)} aria-pressed={roleplay} aria-label="Роль B: ролевая игра, вы — B" onClick={toggleRoleplay}>
          <Drama aria-hidden className="size-4.5" /> <span aria-hidden className="hidden sm:inline">Роль B</span>
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
              className="btn-ghost btn-sm mt-2 -ml-4 text-terracotta"
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

      {!roleplay && (
        <p className="text-sm text-ink-muted">
          Нажмите на слово — перевод и «в словарь»; значок{' '}
          <Languages aria-hidden className="inline size-4 align-[-3px]" />
          <span className="sr-only">«Перевод реплики»</span> — перевод реплики.
        </p>
      )}

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
                  isB ? 'bg-brand-soft text-brand-ink' : 'bg-azulejo-soft text-azulejo-ink',
                )}
              >
                {line.speaker}
              </span>
              <div
                className={cx(
                  'flex min-w-0 max-w-[calc(100%-2.5rem)] items-start gap-1 rounded-card border max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-0 py-2 pr-1.5 pl-3.5 shadow-card transition-[border-color,box-shadow] sm:max-w-[75%]',
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
                      className="btn-secondary btn-sm"
                      id={`dlg-reveal-${i}`}
                      onClick={() => reveal(i)}
                    >
                      <Eye aria-hidden className="size-4" /> Показать
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Phones: the bubble is a grid — the pt line beside its two actions, the translation under both
                        (full bubble width), so neither column of text is squeezed. */}
                    <div className="min-w-0 flex-1 py-0.5 max-sm:contents">
                      {/* Plain pt text (not a button): tap / double-click / select a word → word card;
                          focus + Enter → «Все слова фразы». */}
                      <Pt
                        as="p"
                        id={`dlg-line-${i}`}
                        tabIndex={0}
                        src={{ kind: 'situation', id: situation.id, part: 'dialogue', index: i }}
                        ru={line.ru}
                        aria-describedby={ruShown(i) ? `dlg-ru-${i}` : undefined}
                        className="scroll-mt-28 rounded-sm text-base leading-snug font-semibold max-sm:col-start-1 max-sm:row-start-1 max-sm:self-center max-sm:py-1"
                      >
                        {line.pt}
                      </Pt>
                      {ruShown(i) && (
                        <p id={`dlg-ru-${i}`} className="mt-0.5 text-sm text-ink-muted max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-0 max-sm:pr-2 max-sm:pb-1">
                          {line.ru}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1 max-sm:col-start-2 max-sm:row-start-1">
                    <button
                      type="button"
                      aria-expanded={ruShown(i)}
                      aria-controls={ruShown(i) ? `dlg-ru-${i}` : undefined}
                      aria-label={`Перевод реплики ${i + 1}`}
                      title="Перевод реплики"
                      onClick={() => setRuOverride((m) => new Map(m).set(i, !ruShown(i)))}
                      className={cx(
                        'grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-2 active:scale-95',
                        ruShown(i) ? 'text-ink' : 'text-ink-muted',
                      )}
                    >
                      <Languages aria-hidden className="size-4.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void playLine(i)}
                      aria-label={isActive && !running ? 'Остановить' : `Прослушать реплику ${i + 1}`}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-azulejo transition-colors hover:bg-azulejo-soft active:scale-95"
                    >
                      {isActive ? <Square aria-hidden className="size-4 fill-current" /> : <Play aria-hidden className="size-4.5 fill-current" />}
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
