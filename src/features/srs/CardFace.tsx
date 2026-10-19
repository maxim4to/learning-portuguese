import { Link } from 'react-router-dom'
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
    <div className="flex min-h-64 flex-col">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${KIND_CHIP[card.kind]}`}>{KIND_LABEL[card.kind]}</span>
        {topic && <span className="truncate text-stone-500">{topic.title}</span>}
      </div>

      {/* Front */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
        {task ? (
          <>
            <p className="text-sm text-stone-500">Задание, в котором была ошибка</p>
            <p className="text-xl font-medium text-balance">{task.prompt}</p>
            {task.instruction && <p className="text-sm text-stone-500">{task.instruction}</p>}
            {task.listen && <SpeakButton text={task.listen} voice={voice} rate={rate} label="Прослушать задание" />}
          </>
        ) : (
          <p className="text-2xl font-medium text-balance">{card.front}</p>
        )}
      </div>

      {/* Back */}
      {revealed && (
        <div className="space-y-3 border-t border-dashed border-stone-300 pt-5 text-center dark:border-stone-700">
          <div className="flex items-center justify-center gap-3">
            <p lang="pt-PT" className="text-2xl font-semibold text-brand-800 text-balance dark:text-brand-100">
              {card.back}
            </p>
            <SpeakButton text={fullSentence ?? card.back} voice={voice} rate={rate} />
          </div>
          {fullSentence && (
            <p lang="pt-PT" className="text-stone-700 dark:text-stone-300">
              {fullSentence}
            </p>
          )}
          {card.kind === 'error' && task && card.front !== task.prompt && !card.front.startsWith('🎧') && (
            <p className="text-sm text-stone-500">{card.front}</p>
          )}
          {explanation && <p className="text-sm text-stone-600 dark:text-stone-400">{explanation}</p>}
          {example && (
            <div className="mx-auto max-w-md rounded-xl bg-stone-50 p-3 text-left text-sm dark:bg-stone-800/60">
              <p className="text-xs text-stone-500">Пример</p>
              <div className="flex items-center gap-2">
                <p lang="pt-PT" className="flex-1 font-medium">
                  {example.pt}
                </p>
                <SpeakButton text={example.pt} voice={voice} rate={rate} size="sm" />
              </div>
              <p className="text-stone-500">{example.ru}</p>
            </div>
          )}
          {card.kind === 'error' && topicLink && (
            <p className="text-sm">
              <Link to={topicLink.to}>Повторить тему «{topicLink.title}» →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
