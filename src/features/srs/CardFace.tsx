import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getTopic } from '@/content'
import type { CardKind, Settings, SrsCard } from '@/data/types.ts'
import { errorTopicLink } from './cardContent'
import { KIND_CHIP, KIND_LABEL, LISTEN_MARK, WORD_TASK } from './kinds'
import { SpeakButton } from './SpeakButton'

function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % n
}

/** What the learner is asked to do with the front (front = ru, back = pt-PT for these kinds). */
const FRONT_TASK: Record<Exclude<CardKind, 'error'>, string> = {
  word: 'Как это по-португальски?',
  phrase: 'Переведите на португальский:',
  grammar: 'Переведите на португальский:',
}

interface Props {
  card: SrsCard
  revealed: boolean
  settings: Pick<Settings, 'voice' | 'rate'> | null
}

/** Card header: kind chip + topic title. */
export function CardHeader({ card }: { card: SrsCard }) {
  const topic = card.topicId ? getTopic(card.topicId) : undefined
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={`shrink-0 rounded-pill px-2.5 py-0.5 font-semibold whitespace-nowrap ${KIND_CHIP[card.kind]}`}>{KIND_LABEL[card.kind]}</span>
      {topic && <span className="truncate text-ink-muted">{topic.title}</span>}
    </div>
  )
}

/** Link to the card's topic / situation (error cards). */
export function TopicRepeatLink({ topicId }: { topicId: string | undefined }) {
  const topicLink = errorTopicLink(topicId)
  if (!topicLink) return null
  return (
    <p className="text-sm">
      <Link to={topicLink.to} className="inline-flex min-h-11 items-center gap-1 font-semibold">
        Повторить тему «{topicLink.title}» <ArrowRight aria-hidden className="size-4" />
      </Link>
    </p>
  )
}

/**
 * Flashcard front (+ back when revealed) for word / phrase / grammar cards, and for 'error' cards whose
 * original exercise no longer exists in the content (those are otherwise reviewed as the exercise itself).
 */
export function CardFace({ card, revealed, settings }: Props) {
  const voice = settings?.voice
  const rate = settings?.rate
  const topic = card.topicId ? getTopic(card.topicId) : undefined
  const kind = card.kind
  const isError = kind === 'error'
  // Extra topic example on grammar cards — never the card's own sentence (example cards are built from topic examples).
  const otherExamples = card.kind === 'grammar' ? (topic?.examples ?? []).filter((e) => e.pt !== card.back) : []
  const example = otherExamples.length ? otherExamples[hashIndex(card.id, otherExamples.length)] : undefined
  // Older error cards stored «🎧 <text>» for dictations: the text is the answer, don't show it on the front.
  const errorFront = isError && !card.front.startsWith(LISTEN_MARK) ? card.front : undefined
  // Dictionary cards know their direction; legacy word/phrase/grammar cards are always ru → pt.
  const word = card.wordId && card.mode ? WORD_TASK[card.mode] : undefined
  const frontPt = word?.frontPt ?? false
  const backPt = word?.backPt ?? true
  const listenOnly = card.mode === 'listen'

  return (
    <div className="flex flex-col">
      <CardHeader card={card} />

      {/* Front */}
      <div className="flex min-h-44 flex-col items-center justify-center gap-2 py-6 text-center sm:min-h-52">
        {isError ? (
          <>
            <p className="text-sm font-semibold text-ink-muted">Исходное задание недоступно</p>
            <p className="max-w-prose text-sm text-ink-muted">Упражнение изменилось или удалено. Вспомните правильный ответ:</p>
            {errorFront?.startsWith('Ошибка: ') ? (
              // Built when the exercise was already missing: only the learner's wrong answer is known.
              <p className="text-ink">
                Ваш прошлый ответ: <span lang="pt-PT" className="font-semibold">{errorFront.slice('Ошибка: '.length)}</span>
              </p>
            ) : (
              errorFront && (
                <p lang="pt-PT" className="font-display text-h1 text-balance whitespace-pre-line">
                  {errorFront}
                </p>
              )
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{word?.task ?? FRONT_TASK[kind]}</p>
            {listenOnly ? (
              <SpeakButton text={card.front} voice={voice} rate={rate} label="Прослушать слово" />
            ) : (
              <div className="flex items-center justify-center gap-3">
                <p lang={frontPt ? 'pt-PT' : undefined} className="font-display text-h1 text-balance">
                  {card.front}
                </p>
                {card.mode === 'recognize' && <SpeakButton text={card.front} voice={voice} rate={rate} />}
              </div>
            )}
          </>
        )}
      </div>

      {/* Back */}
      {revealed && (
        <div className="reveal-rows"><div className="space-y-3 rule-dotted pt-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <p lang={backPt ? 'pt-PT' : undefined} className="font-display text-h1 text-balance text-brand-ink">
              {card.back}
            </p>
            {backPt && <SpeakButton text={card.back} voice={voice} rate={rate} />}
          </div>
          {example && (
            <div className="card-sunken mx-auto max-w-md text-left text-sm">
              <p className="text-sm font-semibold text-ink-muted">Пример</p>
              <div className="flex items-center gap-2">
                <p lang="pt-PT" className="flex-1 font-medium">
                  {example.pt}
                </p>
                <SpeakButton text={example.pt} voice={voice} rate={rate} size="sm" />
              </div>
              <p className="text-ink-muted">{example.ru}</p>
            </div>
          )}
          {isError && <TopicRepeatLink topicId={card.topicId} />}
        </div></div>
      )}
    </div>
  )
}
