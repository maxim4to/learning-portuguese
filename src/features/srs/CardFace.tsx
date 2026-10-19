import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { findExercise, getTopic } from '@/content'
import type { Settings, SrsCard } from '@/data/types.ts'
import { describeExercise, errorTopicLink } from './cardContent'
import { KIND_CHIP, KIND_LABEL } from './kinds'
import { SpeakButton } from './SpeakButton'

function hashIndex(s: string, n: number) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h) % n
}

interface Props {
  card: SrsCard
  revealed: boolean
  settings: Pick<Settings, 'voice' | 'rate'> | null
}

/** Front (+ back when revealed) of a review card, rendered per kind. */
export function CardFace({ card, revealed, settings }: Props) {
  const voice = settings?.voice
  const rate = settings?.rate
  const loc = card.exerciseId ? findExercise(card.exerciseId) : undefined
  const task = loc && card.kind === 'error' ? describeExercise(loc.exercise) : undefined
  const topic = card.topicId ? getTopic(card.topicId) : undefined
  const topicLink = errorTopicLink(card.topicId)
  // Extra topic example on grammar cards — never the card's own sentence (example cards are built from topic examples).
  const otherExamples = card.kind === 'grammar' ? (topic?.examples ?? []).filter((e) => e.pt !== card.back) : []
  const example = otherExamples.length ? otherExamples[hashIndex(card.id, otherExamples.length)] : undefined
  const explanation = loc?.exercise.explanation
  // For a single-gap fill-gap error, show/speak the whole corrected sentence.
  const ex = loc?.exercise
  const fullSentence =
    card.kind === 'error' && (ex?.type === 'fill-gap' || ex?.type === 'choice') && ex.prompt.split('___').length === 2
      ? ex.prompt.replace('___', card.back)
      : undefined

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`shrink-0 rounded-pill px-2.5 py-0.5 font-semibold whitespace-nowrap ${KIND_CHIP[card.kind]}`}>{KIND_LABEL[card.kind]}</span>
        {topic && <span className="truncate text-ink-muted">{topic.title}</span>}
      </div>

      {/* Front */}
      <div className="flex min-h-44 flex-col items-center justify-center gap-2 py-6 text-center sm:min-h-52">
        {task ? (
          <>
            <p className="text-sm text-ink-muted">Задание, в котором была ошибка</p>
            <p className="font-display text-[1.75rem] leading-[1.05] text-balance">{task.prompt}</p>
            {task.instruction && <p className="text-sm text-ink-muted">{task.instruction}</p>}
            {task.listen && <SpeakButton text={task.listen} voice={voice} rate={rate} label="Прослушать задание" />}
          </>
        ) : (
          <p className="font-display text-[2.5rem] leading-[0.98] text-balance sm:text-display">{card.front}</p>
        )}
      </div>

      {/* Back */}
      {revealed && (
        <div className="reveal-rows"><div className="space-y-3 rule-dotted pt-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <p lang="pt-PT" className="font-display text-[2.25rem] leading-none text-balance text-brand-ink sm:text-4xl">
              {card.back}
            </p>
            <SpeakButton text={fullSentence ?? card.back} voice={voice} rate={rate} />
          </div>
          {fullSentence && (
            <p lang="pt-PT" className="text-ink">
              {fullSentence}
            </p>
          )}
          {card.kind === 'error' && task && card.front !== task.prompt && !card.front.startsWith('🎧') && (
            <p className="text-sm text-ink-muted">{card.front}</p>
          )}
          {explanation && <p className="mx-auto max-w-prose text-sm text-ink-muted">{explanation}</p>}
          {example && (
            <div className="card-sunken mx-auto max-w-md p-3 text-left text-sm">
              <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Пример</p>
              <div className="flex items-center gap-2">
                <p lang="pt-PT" className="flex-1 font-medium">
                  {example.pt}
                </p>
                <SpeakButton text={example.pt} voice={voice} rate={rate} size="sm" />
              </div>
              <p className="text-ink-muted">{example.ru}</p>
            </div>
          )}
          {card.kind === 'error' && topicLink && (
            <p className="text-sm">
              <Link to={topicLink.to} className="inline-flex min-h-11 items-center gap-1 font-semibold">
                Повторить тему «{topicLink.title}» <ArrowRight aria-hidden className="size-4" />
              </Link>
            </p>
          )}
        </div></div>
      )}
    </div>
  )
}
