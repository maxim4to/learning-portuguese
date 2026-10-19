import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getTopic, type Topic } from '@/content'
import { Markdown } from '@/components/Markdown'
import { Collapsible } from './Collapsible'
import { ExamplesSection } from './ExamplesSection'
import { MissingTopicPage } from './MissingTopicPage'
import { PracticeSection } from './PracticeSection'
import { TopicHeader } from './TopicHeader'
import { useProgressMap } from './useTopicProgress'

const TABS = ['theory', 'examples', 'exercises', 'mini-test'] as const
type Tab = (typeof TABS)[number]

export function TopicPage() {
  const { id = '' } = useParams()
  const topic = getTopic(id)
  if (!topic) return <MissingTopicPage id={id} />
  return <TopicLesson key={topic.id} topic={topic} />
}

function TopicLesson({ topic }: { topic: Topic }) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : 'theory'
  const { map: progress, reload } = useProgressMap()

  const setTab = (t: Tab) => {
    setParams(t === 'theory' ? {} : { tab: t }, { replace: true })
  }
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [topic.id])

  const tabLabel: Record<Tab, string> = {
    theory: 'Теория',
    examples: 'Примеры',
    exercises: 'Упражнения',
    'mini-test': 'Мини-тест',
  }
  const tabCount: Partial<Record<Tab, number>> = { exercises: topic.exercises.length, 'mini-test': topic.miniTest.length }

  const goTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <article className="space-y-5">
      <TopicHeader topic={topic} progress={progress} />

      <div
        role="tablist"
        aria-label="Разделы темы"
        className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur [scrollbar-width:none] md:top-[53px] md:mx-0 md:rounded-xl md:border md:px-1.5 md:py-1.5 dark:border-stone-800 dark:bg-stone-950/95"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 sm:px-3 text-sm font-medium whitespace-nowrap transition ${
              tab === t
                ? 'bg-brand-700 text-white'
                : 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {tabLabel[t]}
            {tabCount[t] !== undefined && <span className="hidden opacity-70 sm:inline"> · {tabCount[t]}</span>}
          </button>
        ))}
      </div>

      {/* All panels stay mounted so an in-progress exercise run survives tab switches. */}
      <section role="tabpanel" hidden={tab !== 'theory'} className="space-y-4">
        <div className="card sm:p-6">
          <Markdown>{topic.theory}</Markdown>
        </div>
        {topic.ptVsBr && (
          <Collapsible title="PT vs BR" icon="🇵🇹">
            <Markdown>{topic.ptVsBr}</Markdown>
          </Collapsible>
        )}
        {topic.commonErrors && (
          <Collapsible title="Частые ошибки" icon="⚠️">
            <Markdown>{topic.commonErrors}</Markdown>
          </Collapsible>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary" onClick={() => goTab('examples')}>
            Примеры →
          </button>
          <button type="button" className="btn-secondary" onClick={() => goTab('exercises')}>
            К упражнениям
          </button>
        </div>
      </section>

      <section role="tabpanel" hidden={tab !== 'examples'} className="space-y-4">
        <ExamplesSection topic={topic} />
        <button type="button" className="btn-primary" onClick={() => goTab('exercises')}>
          К упражнениям →
        </button>
      </section>

      <section role="tabpanel" hidden={tab !== 'exercises'}>
        <PracticeSection
          topic={topic}
          exercises={topic.exercises}
          source="lesson"
          title="Упражнения"
          progress={progress.get(topic.id)}
          onSaved={() => void reload()}
          next={topic.miniTest.length ? { label: 'Мини-тест →', onClick: () => goTab('mini-test') } : undefined}
        />
      </section>

      <section role="tabpanel" hidden={tab !== 'mini-test'}>
        <PracticeSection
          topic={topic}
          exercises={topic.miniTest}
          source="mini-test"
          title="Мини-тест"
          progress={progress.get(topic.id)}
          onSaved={() => void reload()}
        />
      </section>
    </article>
  )
}
