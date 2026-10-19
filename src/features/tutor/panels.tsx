/** Ready-made «Практика с агентом» panels for each content kind (used by the item pages). */
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import type { Level } from '@/content'
import { useWords } from '@/features/words/useWords'
import { getTutorNotes, type ReadingText, type Situation, type Topic, type VocabTheme } from '@/content'
import { MY_WORDS_ID } from './items'
import { READING_MODES, SITUATION_MODES, TOPIC_MODES, VOCAB_MODES, WORDS_MODES, type SituationMode, type TopicMode } from './modes'
import { buildReadingPrompt, buildSituationPrompt, buildTopicPrompt, buildVocabPrompt, buildWordsPrompt, pickTutorWords } from './prompts'
import { TutorPanel } from './TutorPanel'

export function TopicTutor({ topic, onSaved }: { topic: Topic; onSaved?: () => void }) {
  const build = useCallback((m: TopicMode) => buildTopicPrompt(topic, m, getTutorNotes(topic.id)), [topic])
  return <TutorPanel modes={TOPIC_MODES} build={build} targetIds={[topic.id]} onSaved={onSaved} />
}

export function SituationTutor({ situation, onSaved }: { situation: Situation; onSaved?: () => void }) {
  const build = useCallback((m: SituationMode) => buildSituationPrompt(situation, m, getTutorNotes(situation.id)), [situation])
  return <TutorPanel modes={SITUATION_MODES} build={build} targetIds={[situation.id]} onSaved={onSaved} />
}

/** Section with heading + anchor `#tutor` (reading / vocab pages have no tabs). */
export function TutorSection({ children }: { children: ReactNode }) {
  return (
    <section id="tutor" className="scroll-mt-20 space-y-3 md:scroll-mt-24">
      <h2 className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-11 place-items-center rounded-full bg-terracotta-fill text-on-terracotta">
          <Sparkles className="size-5" />
        </span>
        Практика с агентом
      </h2>
      {children}
    </section>
  )
}

export function ReadingTutor({ text }: { text: ReadingText }) {
  const build = useCallback(() => buildReadingPrompt(text, getTutorNotes(text.id)), [text])
  return (
    <TutorSection>
      <TutorPanel modes={READING_MODES} build={build} targetIds={[text.id]} />
    </TutorSection>
  )
}

export function VocabTutor({ theme }: { theme: VocabTheme }) {
  const build = useCallback(() => buildVocabPrompt(theme, getTutorNotes(theme.id)), [theme])
  return (
    <TutorSection>
      <TutorPanel modes={VOCAB_MODES} build={build} targetIds={[theme.id]} />
    </TutorSection>
  )
}

const LEVEL_ORDER: Level[] = ['A1', 'A2', 'B1', 'B2']

/**
 * «Мои слова»: the prompt practises up to 30 dictionary words (due / learning first, then recent new; known skipped).
 */
function useTutorWords() {
  const dict = useWords()
  const [now] = useState(() => Date.now())
  return useMemo(() => {
    const items = dict.words.map((entry) => ({ entry, status: dict.statuses.get(entry.id) ?? 'new', cards: dict.cardsByWord.get(entry.id) ?? [] }))
    const words = pickTutorWords(items, now)
    // Prompt level: the most common level among the picked words (A2 when unknown).
    const levels = new Map<Level, number>()
    for (const w of dict.words) if (w.level) levels.set(w.level, (levels.get(w.level) ?? 0) + 1)
    const level = LEVEL_ORDER.reduce<Level | undefined>((best, l) => ((levels.get(l) ?? 0) > (best ? (levels.get(best) ?? 0) : 0) ? l : best), undefined)
    return { words, level, ready: dict.status === 'ready' }
  }, [dict, now])
}

export function WordsTutor({ onSaved, hideHubLink }: { onSaved?: () => void; hideHubLink?: boolean }) {
  const { words, level, ready } = useTutorWords()
  const build = useCallback(() => buildWordsPrompt(words, { level }), [words, level])
  if (!ready) return null
  if (words.length === 0) {
    return (
      <p className="rounded-control bg-surface-2 p-4 text-sm text-ink-muted">
        Сейчас в словаре нет слов в работе (новых или тех, что вы учите) — выученные в промпт не попадают. Добавьте слова: нажмите на
        любое португальское слово в диалоге или тексте и выберите «Добавить в словарь».
      </p>
    )
  }
  return <TutorPanel modes={WORDS_MODES} build={build} targetIds={[MY_WORDS_ID]} onSaved={onSaved} hideHubLink={hideHubLink} />
}
