/** Ready-made «Практика с агентом» panels for each content kind (used by the item pages). */
import { useCallback, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { getTutorNotes, type ReadingText, type Situation, type Topic, type VocabTheme } from '@/content'
import { READING_MODES, SITUATION_MODES, TOPIC_MODES, VOCAB_MODES, type SituationMode, type TopicMode } from './modes'
import { buildReadingPrompt, buildSituationPrompt, buildTopicPrompt, buildVocabPrompt } from './prompts'
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
function TutorSection({ children }: { children: ReactNode }) {
  return (
    <section id="tutor" className="scroll-mt-20 space-y-3 md:scroll-mt-24">
      <h2 className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-terracotta-soft text-terracotta">
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
