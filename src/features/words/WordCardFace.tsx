/**
 * Faces of personal-dictionary cards (`wordId` + `mode`) in the review session:
 * - recognize: PT word (+ audio) → «Что это значит?» → meanings + example;
 * - produce:   RU meaning (+ «сущ., ж. р.») → type the PT word (or recall and flip) → PT with article + example;
 * - listen:    the word plays → type what was heard (or recall) → PT + RU;
 * - cloze:     the source sentence with the seen form masked → type the form → full sentence.
 * Typed answers (Settings.typeWordAnswers) are graded by engine/grading (accent-only mistakes count with
 * Settings.lenientAccents); the session then suggests a rating like for error cards.
 * Word lookup stays off on the question side and turns on after the answer / reveal.
 */
import { useEffect, useEffectEvent, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleAlert, CircleCheck, CircleHelp, CircleX } from 'lucide-react'
import type { Settings, SrsCard, WordEntry } from '@/data/types.ts'
import { cx } from '@/components/cx'
import { SpeakButton as SpeakButtonShared } from '@/components/SpeakButton'
import { speak, stopSpeaking } from '@/engine/audio'
import { gradeAnswer } from '@/engine/grading'
import type { AnswerRecord } from '@/features/exercises/types'
import { TextAnswer } from '@/features/exercises/TextAnswer'
import { focusPrimary, hasFinePointer } from '@/features/exercises/keyboard'
import { GenderBadge } from '@/features/library/ui'
import { KIND_CHIP, WORD_TASK } from '@/features/srs/kinds'
import { SpeakButton } from '@/features/srs/SpeakButton'
import { useListenText } from './audio.ts'
import { GAP, clozeAnswers, clozeSource, splitByMask, wordAnswers } from './cloze.ts'
import { lookupAttrs, sourceTitle, wordHref } from './source.ts'
import { WORD_MODE_LABEL } from './status.ts'
import { useWord } from './useWords.ts'
import { exampleSource, wordHint, wordPt } from './wordOps.ts'

export type FaceSettings = (Pick<Settings, 'voice' | 'rate'> & Partial<Pick<Settings, 'lenientAccents' | 'typeWordAnswers'>>) | null

/** The sentence with the gap drawn as a blank (the `___` marks). */
function GapSentence({ text, className }: { text: string; className?: string }) {
  const parts = text.split(GAP)
  return (
    <p lang="pt-PT" className={className}>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <span className="mx-0.5 inline-block w-[4.5ch] translate-y-[0.1em] border-b-[3px] border-brand align-baseline" aria-label="пропуск" role="img" />
          )}
        </span>
      ))}
    </p>
  )
}

/** The sentence with the masked form emphasised (after the answer). */
function MarkedSentence({ text, masked, className }: { text: string; masked: string; className?: string }) {
  return (
    <p lang="pt-PT" className={className}>
      {splitByMask(text, masked).map((seg, i) =>
        seg.form ? (
          <b key={i} className="font-bold text-brand-ink">
            {seg.text}
          </b>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  )
}

/** Verdict of a typed answer (icon + heading, «Ваш ответ», «Верно»). */
function WordVerdict({ rec, lenient }: { rec: AnswerRecord; lenient: boolean }) {
  const tone = rec.skipped ? 'skipped' : rec.verdict
  const head =
    tone === 'correct'
      ? 'Верно!'
      : tone === 'accents'
        ? lenient
          ? 'Верно, но проверьте акценты'
          : 'Почти: ошибка только в акцентах'
        : tone === 'skipped'
          ? 'Ничего страшного — вот ответ'
          : 'Неверно'
  const box = {
    correct: 'border-success-line bg-success-soft',
    accents: 'border-warning-line bg-warning-soft',
    wrong: 'border-danger-line bg-danger-soft',
    skipped: 'border-line-strong bg-surface-2',
  }[tone]
  const Icon = { correct: CircleCheck, accents: CircleAlert, wrong: CircleX, skipped: CircleHelp }[tone]
  const iconTone = { correct: 'text-success', accents: 'text-warning', wrong: 'text-danger', skipped: 'text-ink-muted' }[tone]
  return (
    <div className={cx('animate-enter space-y-2 rounded-card border p-4 text-left', box)}>
      <p className="flex items-center gap-2.5 font-semibold">
        <Icon aria-hidden className={cx('size-5 shrink-0', iconTone)} />
        {head}
      </p>
      {tone !== 'correct' && (
        <dl className="grid gap-x-3 gap-y-0.5 text-base sm:grid-cols-[7rem_1fr]">
          {!rec.skipped && (
            <>
              <dt className="text-sm text-ink-muted">Ваш ответ</dt>
              <dd lang="pt-PT" className={cx('min-w-0 break-words', tone === 'wrong' && 'text-danger line-through decoration-danger/50 decoration-2')}>
                {rec.given || '—'}
              </dd>
            </>
          )}
          <dt className="text-sm text-ink-muted">Верно</dt>
          <dd lang="pt-PT" className="min-w-0 font-semibold break-words text-ink">
            {rec.expected}
          </dd>
        </dl>
      )}
    </div>
  )
}

/** Header of a dictionary card: «Слово · RU → PT» chip + «Мой словарь · из «В кафе»». */
export function WordCardHeader({ card, entry }: { card: SrsCard; entry?: WordEntry }) {
  const src = entry?.sources.at(-1)
  const title = src ? sourceTitle(src.src) : undefined
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={`shrink-0 rounded-pill px-2.5 py-0.5 font-semibold whitespace-nowrap ${KIND_CHIP.word}`}>
        Слово{card.mode ? ` · ${WORD_MODE_LABEL[card.mode]}` : ''}
      </span>
      <span className="truncate text-ink-muted max-sm:hidden">Мой словарь{title ? ` · из «${title}»` : ''}</span>
    </div>
  )
}

interface Props {
  card: SrsCard
  revealed: boolean
  settings: FaceSettings
  /** Answer by typing (see `isTypedWordCard`). */
  typed: boolean
  /** The typed answer once given (from the session). */
  answer?: AnswerRecord | null
  onAnswered?(rec: AnswerRecord): void
  /** Focus the text field on mount even on touch (mounted right after the learner's own action). */
  focusControl?: boolean
}

export function WordCardFace({ card, revealed, settings, typed, answer, onAnswered, focusControl }: Props) {
  const entry = useWord(card.wordId)
  const mode = card.mode ?? 'recognize'
  const voice = settings?.voice
  const lenient = settings?.lenientAccents ?? false
  const rootRef = useRef<HTMLDivElement>(null)
  const pt = entry ? wordPt(entry) : mode === 'recognize' || mode === 'listen' ? card.front : card.back
  const ru = entry?.ru ?? (mode === 'recognize' ? card.back : mode === 'produce' ? card.front : undefined)
  const hint = entry ? wordHint(entry) : ''
  const cloze = mode === 'cloze' ? (entry ? clozeSource(entry) : undefined) : undefined
  const clozeMasked = cloze?.masked ?? (mode === 'cloze' ? card.front : '')
  const clozeFull = cloze?.source.sentence ?? (mode === 'cloze' ? card.back : '')
  const example = entry ? exampleSource(entry) : undefined
  const listen = useListenText(mode === 'listen' ? (entry ?? { lemma: card.front }) : undefined)
  const noAudio = mode === 'listen' && listen === null

  const accepted = mode === 'cloze' ? (entry && cloze ? clozeAnswers(entry, cloze.form) : [clozeFull]) : entry ? wordAnswers(entry) : [pt]
  const expectedShown = mode === 'cloze' ? (cloze?.form ?? accepted[0]) : pt

  // Listening: play once when the card appears (a rating click / key just happened — a user gesture).
  const autoPlay = useEffectEvent((text: string) => {
    void speak(text, { voice, rate: settings?.rate })
  })
  useEffect(() => {
    if (mode === 'listen' && listen) autoPlay(listen)
  }, [mode, listen])
  useEffect(() => () => stopSpeaking(), [])

  // Typed cards: focus the field (fine pointer, or right after a rating on touch).
  const focusOnMount = useEffectEvent(() => {
    if (!typed || revealed) return
    if (focusControl || hasFinePointer()) focusPrimary(rootRef.current)
  })
  useEffect(() => focusOnMount(), [])

  function submit(given: string, skipped = false) {
    if (answer) return
    const g = gradeAnswer(given, accepted)
    const verdict = skipped ? 'wrong' : g.verdict
    const ok = verdict === 'correct' || (verdict === 'accents' && lenient)
    onAnswered?.({
      exerciseId: card.id,
      topicId: card.topicId ?? '',
      given,
      expected: skipped ? expectedShown : mode === 'cloze' ? g.closest : expectedShown,
      verdict,
      ok,
      ...(skipped ? { skipped: true } : {}),
    })
  }

  const task =
    mode === 'listen'
      ? noAudio
        ? 'Звук недоступен на этом устройстве. Вспомните слово по переводу:'
        : typed
          ? 'Прослушайте и напишите слово'
          : WORD_TASK.listen.task
      : mode === 'cloze'
        ? typed
          ? 'Впишите пропущенное слово'
          : WORD_TASK.cloze.task
        : mode === 'produce' && typed
          ? 'Напишите по-португальски'
          : WORD_TASK[mode].task
  const fieldHint = `${card.id}-task`

  return (
    <div
      ref={rootRef}
      className="flex flex-col"
      // Word lookup only after the answer: before it the card is the question itself.
      {...lookupAttrs({ src: { kind: 'review', id: card.id }, ru: mode === 'cloze' ? undefined : ru, locked: !revealed })}
    >
      <WordCardHeader card={card} entry={entry} />

      {/* Front */}
      <div id={fieldHint} className="flex min-h-44 flex-col items-center justify-center gap-3 py-6 text-center sm:min-h-52">
        <p className="text-sm text-ink-muted">{task}</p>
        {mode === 'recognize' && (
          <>
            <div className="flex items-center justify-center gap-3">
              <p lang="pt-PT" className="font-display text-h1 text-balance">
                {pt}
              </p>
              <SpeakButton text={pt} voice={voice} />
            </div>
            {entry?.gender && entry.pos === 'noun' && <GenderBadge gender={entry.gender} />}
          </>
        )}
        {(mode === 'produce' || (mode === 'listen' && noAudio)) && (
          <>
            <p className="font-display text-h1 text-balance">{ru}</p>
            {hint && <p className="text-sm text-ink-muted">{hint}</p>}
          </>
        )}
        {mode === 'listen' && !noAudio && (
          <div className="flex items-center justify-center gap-2">
            {listen ? (
              <>
                <SpeakButton text={listen} voice={voice} label="Прослушать слово" />
                <SpeakButtonSlow text={listen} voice={voice} />
              </>
            ) : (
              <span className="h-11 w-40 animate-pulse rounded-pill bg-surface-2" aria-label="Загрузка звука" role="status" />
            )}
          </div>
        )}
        {mode === 'cloze' && (
          <>
            <GapSentence text={clozeMasked} className="max-w-prose text-prompt text-balance" />
            {ru && <p className="text-sm text-ink-muted">Подсказка: {ru}</p>}
          </>
        )}
      </div>

      {/* Typed answer */}
      {typed && (
        <div className="space-y-4 pb-2">
          <TextAnswer
            key={card.id}
            locked={!!answer}
            result={answer ?? undefined}
            label={mode === 'cloze' ? 'Пропущенное слово' : 'Слово по-португальски'}
            describedBy={fieldHint}
            placeholder={mode === 'cloze' ? 'форма из предложения' : 'по-португальски'}
            onSubmit={(v) => submit(v)}
            onSkip={() => submit('', true)}
          />
          <div aria-live="polite">{answer && <WordVerdict rec={answer} lenient={lenient} />}</div>
        </div>
      )}

      {/* Back */}
      {revealed && (
        <div className="reveal-rows">
          <div className="space-y-3 rule-dotted pt-6 text-center">
            {mode === 'recognize' ? (
              <p className="font-display text-h1 text-balance text-brand-ink">{ru}</p>
            ) : mode === 'cloze' ? (
              <div className="flex items-center justify-center gap-3">
                <MarkedSentence text={clozeFull} masked={clozeMasked} className="max-w-prose text-prompt text-balance" />
                <SpeakButton text={clozeFull} voice={voice} label="Прослушать предложение" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3">
                  <p lang="pt-PT" className="font-display text-h1 text-balance text-brand-ink">
                    {pt}
                  </p>
                  <SpeakButton text={pt} voice={voice} />
                </div>
                {mode === 'listen' && ru && <p className="text-base text-ink-muted">{ru}</p>}
              </>
            )}
            {mode === 'cloze' && (
              <p className="text-base text-ink-muted">
                <span lang="pt-PT" className="font-semibold text-ink">
                  {pt}
                </span>{' '}
                — {ru}
              </p>
            )}
            {mode === 'cloze' && cloze?.source.sentenceRu && <p className="text-sm text-ink-muted">{cloze.source.sentenceRu}</p>}
            {mode !== 'cloze' && example?.sentence && (
              <div className="card-sunken mx-auto max-w-md text-left">
                <p className="text-sm font-semibold text-ink-muted">Пример</p>
                <div className="flex items-center gap-2">
                  <p lang="pt-PT" data-pt-ru={example.sentenceRu} className="flex-1 font-medium">
                    {example.sentence}
                  </p>
                  <SpeakButton text={example.sentence} voice={voice} size="sm" />
                </div>
                {example.sentenceRu && <p className="text-sm text-ink-muted">{example.sentenceRu}</p>}
              </div>
            )}
            {entry && (
              <p className="text-sm">
                <Link to={wordHref(entry.id)} className="inline-flex min-h-11 items-center gap-1 font-semibold">
                  Открыть слово <ArrowRight aria-hidden className="size-4" />
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** «Медленно» for the listening card (same button family, snail icon). */
function SpeakButtonSlow({ text, voice }: { text: string; voice?: Settings['voice'] }) {
  return <SpeakButtonShared text={text} voice={voice} rateFactor={0.75} />
}
