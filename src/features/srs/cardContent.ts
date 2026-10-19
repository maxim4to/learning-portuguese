/** Content lookups used to render SRS cards and error entries. */
import { findExercise, getSituation, getTopic, getVocabTheme, type Exercise } from '@/content'
import type { SrsCard } from '@/data/types.ts'
import type { PtSource } from '@/features/words/source'

/** Link target for a topicId that may be a grammar topic or a situation. */
export function errorTopicLink(topicId: string | undefined): { to: string; title: string } | null {
  if (!topicId) return null
  const t = getTopic(topicId)
  if (t) return { to: `/topic/${t.id}`, title: t.title }
  const s = getSituation(topicId)
  if (s) return { to: `/situation/${s.id}`, title: s.title }
  return null
}

/** Human-readable task text of an exercise (what the learner saw). */
export function describeExercise(ex: Exercise): { prompt: string; instruction?: string; listen?: string } {
  switch (ex.type) {
    case 'fill-gap':
      return { prompt: ex.prompt, instruction: ex.ru }
    case 'choice':
      return { prompt: ex.prompt, instruction: ex.options.join(' / ') }
    case 'transform':
      return { prompt: ex.prompt, instruction: ex.instruction }
    case 'order-words':
      return { prompt: ex.words.join(' · '), instruction: ex.ru }
    case 'translate-ru-pt':
      return { prompt: ex.ru, instruction: 'Переведите на португальский' }
    case 'listen-type':
      return { prompt: 'Диктант', listen: ex.text }
    case 'listen-choice':
      return { prompt: ex.prompt ?? 'Прослушайте и выберите', instruction: ex.options.join(' / '), listen: ex.text }
    case 'match':
      return { prompt: ex.prompt ?? 'Сопоставьте', instruction: ex.pairs.map((p) => `${p.left} — ${p.right}`).join('; ') }
    case 'speak-shadow':
      return { prompt: ex.text, instruction: ex.ru }
  }
}

export function exercisePromptText(exerciseId: string | undefined): string | undefined {
  const ex = exerciseId ? findExercise(exerciseId)?.exercise : undefined
  return ex ? describeExercise(ex).prompt : undefined
}

/**
 * Where the card's pt text comes from, for words saved from the card: topic example (`ex:<topic>:<i>`),
 * situation phrase (`ph:<situation>:<i>`), theme / situation word (`w:<owner>:<i>`); otherwise the review itself.
 */
export function cardSource(card: SrsCard): PtSource {
  const [prefix, owner = '', i] = card.id.split(':')
  const index = i !== undefined && /^\d+$/.test(i) ? Number(i) : undefined
  if (prefix === 'ex' && getTopic(owner)) return { kind: 'topic', id: owner, part: 'examples', index }
  if (prefix === 'ph' && getSituation(owner)) return { kind: 'situation', id: owner, part: 'phrases', index }
  if (prefix === 'w' && getVocabTheme(owner)) return { kind: 'vocab', id: owner, part: 'examples', index }
  if (prefix === 'w' && getSituation(owner)) return { kind: 'situation', id: owner, part: 'vocab', index }
  return { kind: 'review', id: card.id }
}
