/**
 * «Учить новые» (/words?learn=1): introduces up to 5 new dictionary words (within today's new-card limit).
 * 1. Study: each word on its own card — lemma with article + audio, gender / part of speech, meanings, the example
 *    from its source with audio; «Знаю уже» marks it known (no cards, no limit used).
 * 2. Quick check: the studied words in random order, PT → pick the meaning of 4 (distractors: the learner's other
 *    words, then lexicon entries of the same part of speech). The answer rates the recognize card through FSRS
 *    (right → Хорошо, wrong → Снова), counts it against the daily limit and unlocks the next modes; from then on
 *    the word is in the normal review queue.
 * Keys: Enter / Space — «Дальше»; 1–4 — an option; ↑↓ — move between options.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Check, CircleCheck, CircleX, GraduationCap, X } from 'lucide-react'
import { Button, ButtonLink } from '@/components/Button'
import { cx } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { ProgressBar } from '@/components/ProgressBar'
import { LevelBadge } from '@/components/StatusBadge'
import { useToast } from '@/components/toastContext'
import type { WordEntry } from '@/data/types.ts'
import { loadLexicon, type Lexicon } from '@/engine/lexicon/lookup'
import { useSettings } from '@/features/exercises/useSettings'
import { noMods, rovingIndex } from '@/features/exercises/keyboard'
import { scrollBehavior } from '@/components/cx'
import { plural } from '@/features/library/format'
import { GenderBadge } from '@/features/library/ui'
import { SpeakButton } from '@/features/srs/SpeakButton'
import { newSeenToday } from '@/features/srs/newCardCounter'
import { isLookupOpen } from './capture/store'
import { maskForm, splitByMask } from './cloze.ts'
import { Pt } from './Pt.tsx'
import { decodeSource, lookupAttrs, sourceLabel } from './source.ts'
import { learnCandidates, learnCount, type LearnItem } from './learn.ts'
import { useWordActions, useWords } from './useWords.ts'
import { exampleSource, wordHint, wordPt } from './wordOps.ts'

/** Scrolls `el` into view when it is below the fold or under the phone tab bar (its scroll margin = `--bottom-chrome`). */
function revealAboveTabBar(el: HTMLElement) {
  el.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
}

const firstMeaning = (ru: string) => ru.split(/\s*;\s*/)[0]?.trim() || ru

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Up to 3 distractor meanings: other dictionary words first, then random lexicon entries (same pos preferred). */
function distractors(entry: WordEntry, words: readonly WordEntry[], lex: Lexicon | null): string[] {
  const right = firstMeaning(entry.ru).toLowerCase()
  const seen = new Set([right])
  const out: string[] = []
  const add = (ru: string | undefined) => {
    const m = ru ? firstMeaning(ru) : ''
    if (!m || seen.has(m.toLowerCase()) || out.length >= 3) return
    seen.add(m.toLowerCase())
    out.push(m)
  }
  const others = shuffle(words.filter((w) => w.id !== entry.id))
  for (const w of others.filter((w) => w.pos === entry.pos)) add(w.ru)
  if (lex) {
    for (let tries = 0; tries < 400 && out.length < 3; tries++) {
      const e = lex.entryAt(Math.floor(Math.random() * lex.size.entries))
      if (e && (tries > 200 || !entry.pos || e.pos === entry.pos)) add(e.ru[0])
    }
  }
  for (const w of others) add(w.ru)
  return out
}

interface Check {
  item: LearnItem
  options: string[]
  correct: number
}

type Phase = { kind: 'study'; i: number } | { kind: 'check'; i: number; picked: number | null } | { kind: 'done' }

/** The source sentence with the seen form in bold. */
function ExampleSentence({ sentence, form }: { sentence: string; form: string }) {
  return (
    <>
      {splitByMask(sentence, maskForm(sentence, form)).map((seg, i) =>
        seg.form ? (
          <b key={i} className="font-bold text-brand-ink">
            {seg.text}
          </b>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  )
}

export function LearnNewSession({ onClose }: { onClose(): void }) {
  const dict = useWords()
  const actions = useWordActions()
  const settings = useSettings()
  const toast = useToast()
  const [items, setItems] = useState<LearnItem[] | null>(null)
  const [knownIds, setKnownIds] = useState<ReadonlySet<string>>(() => new Set())
  const [checks, setChecks] = useState<Check[]>([])
  const [results, setResults] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const [phase, setPhase] = useState<Phase>({ kind: 'study', i: 0 })
  const [lex, setLex] = useState<Lexicon | null>(null)
  const [busy, setBusy] = useState(false)
  const [activeOpt, setActiveOpt] = useState(0)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const optRefs = useRef<(HTMLButtonElement | null)[]>([])

  // The batch is fixed once the dictionary is loaded (ratings change statuses while the session runs).
  if (items === null && dict.status === 'ready') {
    const cands = learnCandidates(dict.words, dict.cardsByWord, dict.statuses)
    setItems(cands.slice(0, learnCount(cands.length, settings.newCardsPerDay, newSeenToday())))
  }

  useEffect(() => {
    let alive = true
    loadLexicon().then((l) => alive && setLex(l), () => {})
    return () => {
      alive = false
    }
  }, [])

  const studied = (items ?? []).filter((it) => !knownIds.has(it.entry.id))

  /** `alsoKnown`: a word marked known just now (its state update is not visible to this closure yet). */
  const startCheck = useCallback(
    (alsoKnown?: string) => {
      const list = shuffle((items ?? []).filter((it) => !knownIds.has(it.entry.id) && it.entry.id !== alsoKnown)).map((item): Check => {
        const right = firstMeaning(item.entry.ru)
        const options = shuffle([right, ...distractors(item.entry, dict.words, lex)])
        return { item, options, correct: options.indexOf(right) }
      })
      setChecks(list)
      setActiveOpt(0)
      setPhase(list.length ? { kind: 'check', i: 0, picked: null } : { kind: 'done' })
    },
    [items, knownIds, dict.words, lex],
  )

  const next = useCallback(
    (alsoKnown?: string) => {
      if (!items) return
      if (phase.kind === 'study') {
        if (phase.i + 1 < items.length) setPhase({ kind: 'study', i: phase.i + 1 })
        else startCheck(alsoKnown)
      } else if (phase.kind === 'check' && phase.picked !== null) {
        setActiveOpt(0)
        setPhase(phase.i + 1 < checks.length ? { kind: 'check', i: phase.i + 1, picked: null } : { kind: 'done' })
      }
    },
    [items, phase, checks.length, startCheck],
  )

  async function markKnown(entry: WordEntry) {
    if (busy) return
    setBusy(true)
    try {
      const { undo } = await actions.markKnown(entry.id)
      setKnownIds((s) => new Set(s).add(entry.id))
      toast({ text: `Отмечено как известное: ${wordPt(entry)}`, action: { label: 'Отменить', onClick: () => void undo() } })
      next(entry.id)
    } catch (e) {
      toast({ text: `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const pick = useCallback(
    (i: number) => {
      if (phase.kind !== 'check' || phase.picked !== null) return
      const c = checks[phase.i]
      const ok = i === c.correct
      setPhase({ ...phase, picked: i })
      setResults((m) => new Map(m).set(c.item.entry.id, ok))
      actions
        .rateCard(c.item.card, ok ? 'good' : 'again')
        .catch((e: unknown) => toast({ text: `Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, tone: 'danger' }))
    },
    [phase, checks, actions, toast],
  )

  // Keyboard: Enter / Space → «Дальше»; 1–4 → option; arrows move within the options.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isLookupOpen()) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (!noMods(e) || e.shiftKey) return
      const confirm = e.key === 'Enter' || e.key === ' '
      // A focused button / link handles its own Enter / Space (except the primary «Дальше»).
      if (confirm && t?.closest('button, a') && t !== primaryRef.current) return
      if (phase.kind === 'check' && phase.picked === null) {
        const n = Number(e.key)
        if (Number.isInteger(n) && n >= 1 && n <= checks[phase.i].options.length) {
          e.preventDefault()
          pick(n - 1)
        }
        return
      }
      if (confirm && !e.repeat && phase.kind !== 'done') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, checks, pick, next])

  // Focus: «Дальше» on study screens and after an answer; the first option when a check appears.
  useEffect(() => {
    if (phase.kind === 'check' && phase.picked === null) optRefs.current[0]?.focus({ preventScroll: true })
    else if (primaryRef.current) {
      primaryRef.current.focus({ preventScroll: true })
      // Phones: after an answer, bring «Дальше» (below the options) into view.
      if (phase.kind === 'check') revealAboveTabBar(primaryRef.current)
    }
  }, [phase])

  if (dict.status !== 'ready' || items === null) {
    return <div role="status" aria-label="Загрузка" className="card h-96 animate-pulse" />
  }

  if (items.length === 0) {
    const limitReached = newSeenToday() >= settings.newCardsPerDay
    return (
      <section className="card">
        <EmptyState
          icon={<GraduationCap className="size-7" />}
          tone="azulejo"
          title={limitReached ? 'Лимит новых на сегодня исчерпан' : 'Новых слов нет'}
          text={
            limitReached
              ? `Сегодня уже ${plural(newSeenToday(), 'новая карточка', 'новые карточки', 'новых карточек')} из ${settings.newCardsPerDay}. Лимит меняется в настройках.`
              : 'Все слова словаря уже в повторении. Сохраняйте новые слова из диалогов, текстов и тем.'
          }
          action={
            <Button variant="secondary" onClick={onClose}>
              К словарю
            </Button>
          }
        />
      </section>
    )
  }

  const total = items.length
  const stepDone = phase.kind === 'study' ? phase.i : phase.kind === 'check' ? total + phase.i : total + checks.length
  const progress = stepDone / Math.max(1, total + studied.length)

  return (
    <div className="page-grid">
      <section aria-labelledby="learn-step" className="min-w-0 space-y-4">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <ProgressBar value={progress} size="md" label={`Пройдено шагов: ${stepDone}`} className="flex-1" />
          <span className="tabular-nums">
            {phase.kind === 'study' ? `слово ${phase.i + 1} из ${total}` : phase.kind === 'check' ? `проверка ${phase.i + 1} из ${checks.length}` : 'готово'}
          </span>
          {phase.kind !== 'done' && (
            <Button variant="ghost" size="sm" className="-mr-2" icon={<X />} onClick={onClose}>
              Завершить
            </Button>
          )}
        </div>

        {phase.kind === 'study' && (
          <StudyCard key={items[phase.i].entry.id} entry={items[phase.i].entry} voice={settings.voice}>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => void markKnown(items[phase.i].entry)}>
                Знаю уже
              </Button>
              <Button ref={primaryRef} className="sm:min-w-40" onClick={() => next()}>
                {phase.i + 1 < total ? 'Дальше' : 'К проверке'}
                <kbd className="hidden rounded-md bg-on-brand/20 px-1.5 py-0.5 font-sans text-xs md:inline">Enter</kbd>
              </Button>
            </div>
          </StudyCard>
        )}

        {phase.kind === 'check' && (
          <CheckCard
            key={checks[phase.i].item.entry.id}
            check={checks[phase.i]}
            picked={phase.picked}
            voice={settings.voice}
            optRefs={optRefs}
            active={activeOpt}
            setActive={setActiveOpt}
            onPick={pick}
          >
            {phase.picked !== null && (
              <div className="flex sm:justify-end">
                <Button ref={primaryRef} block className="scroll-mb-[calc(var(--bottom-chrome)+1rem)] sm:w-auto sm:min-w-40" onClick={() => next()}>
                  {phase.i + 1 < checks.length ? 'Дальше' : 'Готово'}
                  <kbd className="hidden rounded-md bg-on-brand/20 px-1.5 py-0.5 font-sans text-xs md:inline">Enter</kbd>
                </Button>
              </div>
            )}
          </CheckCard>
        )}

        {phase.kind === 'done' && <DoneCard items={items} knownIds={knownIds} results={results} onClose={onClose} />}

        <p className="hidden text-center text-sm text-ink-muted md:block">
          {phase.kind === 'check' && phase.picked === null
            ? 'Клавиши: 1–4 или ↑↓ и Enter — вариант ответа'
            : 'Клавиши: Enter или пробел — дальше'}
        </p>
      </section>

      <SessionPanel items={items} knownIds={knownIds} results={results} phase={phase} />
    </div>
  )
}

/** Study screen of one word. */
function StudyCard({ entry, voice, children }: { entry: WordEntry; voice: 'male' | 'female'; children: ReactNode }) {
  const pt = wordPt(entry)
  const hint = wordHint(entry)
  const ex = exampleSource(entry)
  const meanings = entry.ru.split(/\s*;\s*/).filter(Boolean)
  const src = ex ? decodeSource(ex.src) : undefined
  return (
    <div data-halftone-surface="" className="card-raised animate-enter relative isolate space-y-5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-pill bg-azulejo-soft px-2.5 py-0.5 font-semibold text-ink">Новое слово</span>
        {entry.level && <LevelBadge level={entry.level} />}
      </div>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <h2 id="learn-step" lang="pt-PT" className="font-display text-h1 text-balance">
            {pt}
          </h2>
          <SpeakButton text={pt} voice={voice} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-ink-muted">
          {entry.gender && <GenderBadge gender={entry.gender} />}
          {hint && <span>{hint}</span>}
        </div>
        <ul className="space-y-1">
          {meanings.map((m, i) => (
            <li key={i} className={i === 0 ? 'font-display text-h2 text-brand-ink' : 'text-base text-ink-muted'}>
              {m}
            </li>
          ))}
        </ul>
      </div>
      {ex?.sentence && (
        <div className="card-sunken mx-auto max-w-xl space-y-1">
          <p className="text-sm font-semibold text-ink-muted">Пример · {sourceLabel(ex.src)}</p>
          <div className="flex items-start gap-2">
            <Pt as="p" src={src} ru={ex.sentenceRu} className="flex-1 text-base font-medium">
              <ExampleSentence sentence={ex.sentence} form={ex.form || entry.lemma} />
            </Pt>
            <SpeakButton text={ex.sentence} voice={voice} size="sm" label="Прослушать пример" />
          </div>
          {ex.sentenceRu && <p className="text-sm text-ink-muted">{ex.sentenceRu}</p>}
        </div>
      )}
      {entry.note && <p className="text-center text-sm text-ink-muted">{entry.note}</p>}
      {children}
    </div>
  )
}

/** Quick recognition check: PT → one of 4 meanings. Word lookup stays off until answered. */
function CheckCard({
  check,
  picked,
  voice,
  optRefs,
  active,
  setActive,
  onPick,
  children,
}: {
  check: Check
  picked: number | null
  voice: 'male' | 'female'
  optRefs: RefObject<(HTMLButtonElement | null)[]>
  active: number
  setActive(i: number): void
  onPick(i: number): void
  children: ReactNode
}) {
  const pt = wordPt(check.item.entry)
  const locked = picked !== null
  const ok = picked === check.correct
  return (
    <div
      data-halftone-surface=""
      className="card-raised animate-enter relative isolate space-y-5"
      {...lookupAttrs({ src: { kind: 'review', id: check.item.card.id }, locked: !locked })}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-pill bg-azulejo-soft px-2.5 py-0.5 font-semibold text-ink">Проверка</span>
        <span className="text-ink-muted">Что значит это слово?</span>
      </div>
      <div className="flex items-center justify-center gap-3 py-2">
        <h2 id="learn-step" lang="pt-PT" className="font-display text-h1 text-balance">
          {pt}
        </h2>
        <SpeakButton text={pt} voice={voice} />
      </div>
      <ul
        role="radiogroup"
        aria-label="Варианты перевода"
        className="grid gap-2 sm:grid-cols-2"
        onKeyDown={(e) => {
          if (isLookupOpen() || locked || !noMods(e) || e.shiftKey) return
          const to = rovingIndex(e.key, active, check.options.length)
          if (to === null) return
          e.preventDefault()
          setActive(to)
          optRefs.current[to]?.focus()
        }}
      >
        {check.options.map((opt, i) => {
          const isCorrect = i === check.correct
          const isGiven = picked === i
          const tone = !locked
            ? 'border-line-strong bg-surface hover:border-ink active:scale-[0.99]'
            : isCorrect
              ? cx('border-success bg-success-soft text-success font-semibold', isGiven && 'animate-pop')
              : isGiven
                ? 'animate-shake border-danger bg-danger-soft text-danger'
                : 'border-line bg-surface text-ink-muted opacity-70'
          return (
            <li key={i} role="none">
              <button
                ref={(el) => {
                  optRefs.current[i] = el
                }}
                type="button"
                role="radio"
                aria-checked={locked ? isGiven : false}
                tabIndex={i === active ? 0 : -1}
                disabled={locked}
                onFocus={() => setActive(i)}
                onClick={() => onPick(i)}
                className={cx(
                  'flex min-h-13 w-full items-center gap-3 rounded-control border-[1.5px] px-4 py-3 text-left text-base transition-[background-color,border-color,transform] duration-150 disabled:cursor-default',
                  tone,
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'hidden size-6 shrink-0 place-items-center rounded-md border text-xs font-bold text-ink-muted tabular-nums sm:grid',
                    locked ? 'border-transparent' : 'border-line-strong',
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{opt}</span>
                {locked && isCorrect && <Check aria-hidden className="size-5 shrink-0" strokeWidth={2.75} />}
                {locked && isGiven && !isCorrect && <X aria-hidden className="size-5 shrink-0" strokeWidth={2.75} />}
              </button>
            </li>
          )
        })}
      </ul>
      <p aria-live="polite" className={cx('text-center text-sm', !locked && 'sr-only')}>
        {locked && (ok ? 'Верно! Слово ушло в повторение.' : `Неверно: ${pt} — ${check.item.entry.ru}. Слово вернётся в повторении скоро.`)}
      </p>
      {children}
    </div>
  )
}

function DoneCard({
  items,
  knownIds,
  results,
  onClose,
}: {
  items: LearnItem[]
  knownIds: ReadonlySet<string>
  results: ReadonlyMap<string, boolean>
  onClose(): void
}) {
  const learned = items.filter((it) => results.has(it.entry.id)).length
  const right = [...results.values()].filter(Boolean).length
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headRef.current?.focus({ preventScroll: true }), [])
  return (
    <div className="card-raised animate-enter space-y-5 text-center">
      <h2 id="learn-step" ref={headRef} tabIndex={-1} className="outline-none">
        {learned ? `${plural(learned, 'слово', 'слова', 'слов')} в повторении` : 'Готово'}
      </h2>
      <p className="text-ink-muted">
        {learned > 0 && `Сразу вспомнили ${right} из ${learned}. `}
        {knownIds.size > 0 && `Отмечено как известное: ${knownIds.size}. `}
        Дальше слова ведёт интервальное повторение; RU → PT откроется после первого успешного повторения.
      </p>
      <div className="flex flex-col justify-center gap-2 sm:flex-row">
        <ButtonLink to="/review?deck=words">Повторить слова</ButtonLink>
        <Button variant="secondary" onClick={onClose}>
          К словарю
        </Button>
      </div>
    </div>
  )
}

/** Side panel: the words of this session and where each stands. */
function SessionPanel({
  items,
  knownIds,
  results,
  phase,
}: {
  items: LearnItem[]
  knownIds: ReadonlySet<string>
  results: ReadonlyMap<string, boolean>
  phase: Phase
}) {
  return (
    <aside aria-labelledby="learn-panel" className="card flex flex-col gap-3 max-lg:hidden">
      <h2 id="learn-panel">Сессия</h2>
      <ol className="divide-y divide-line text-sm">
        {items.map((it, i) => {
          const r = results.get(it.entry.id)
          const current = phase.kind === 'study' && phase.i === i
          return (
            <li key={it.entry.id} className={cx('flex items-center gap-3 py-2', current && 'font-semibold')}>
              <span lang="pt-PT" className="min-w-0 flex-1 truncate">
                {wordPt(it.entry)}
              </span>
              <span className="shrink-0 text-ink-muted">
                {knownIds.has(it.entry.id) ? (
                  'знаю'
                ) : r === true ? (
                  <CircleCheck aria-label="верно" className="size-4.5 text-success" />
                ) : r === false ? (
                  <CircleX aria-label="ошибка" className="size-4.5 text-danger" />
                ) : phase.kind === 'study' && phase.i === i ? (
                  'сейчас'
                ) : phase.kind === 'study' && phase.i < i ? (
                  'впереди'
                ) : (
                  'изучено'
                )}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="rounded-control bg-surface-2 p-4 text-sm text-ink-muted">
        Сначала знакомство со словом, затем быстрая проверка. Ответ ставит первую оценку карточке PT → RU — дальше слово
        повторяется вместе с остальными.
      </p>
    </aside>
  )
}
