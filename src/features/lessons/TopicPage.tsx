import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Flag, Sparkles, TriangleAlert } from 'lucide-react'
import { getTopic, type Topic } from '@/content'
import { scrollBehavior } from '@/components/cx'
import { Markdown } from '@/components/Markdown'
import { TabPanel, Tabs } from '@/components/Tabs'
import { TopicTutor } from '@/features/tutor/panels'
import { Collapsible } from './Collapsible'
import { ExamplesSection } from './ExamplesSection'
import { MissingTopicPage } from './MissingTopicPage'
import { PracticeSection } from './PracticeSection'
import { TopicHeader } from './TopicHeader'
import { useProgressMap } from './useTopicProgress'
import { plural } from '@/features/library/format'

const TABS = ['theory', 'examples', 'exercises', 'mini-test', 'tutor'] as const
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
  const own = progress.get(topic.id)

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
    tutor: 'С агентом',
  }
  const tabCount: Partial<Record<Tab, number>> = { exercises: topic.exercises.length, 'mini-test': topic.miniTest.length }

  const goTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }

  const id = 'topic'
  return (
    <article className="page">
      <TopicHeader topic={topic} progress={progress} compact={tab === 'exercises' || tab === 'mini-test'} />

      <div className="space-y-4">

      <Tabs
        idBase={id}
        label="Разделы темы"
        sticky
        value={tab}
        onChange={setTab}
        items={TABS.map((t) => ({
          value: t,
          label:
            t === 'tutor' ? (
              <>
                <Sparkles aria-hidden className="size-4 text-terracotta" />
                {tabLabel[t]}
              </>
            ) : (
              tabLabel[t]
            ),
          meta: tabCount[t] !== undefined ? <span className="hidden sm:inline">{tabCount[t]}</span> : undefined,
        }))}
      />

      {/* All panels stay mounted so an in-progress exercise run survives tab switches. */}
      <TabPanel idBase={id} value="theory" active={tab === 'theory'} className="page-grid">
        <div className="min-w-0 space-y-4">
        <div className="card">
          <Markdown pt={{ kind: 'topic', id: topic.id, part: 'theory' }}>{topic.theory}</Markdown>
        </div>
        {topic.ptVsBr && (
          <Collapsible title="PT vs BR" icon={<Flag className="size-4" />}>
            <Markdown pt={{ kind: 'topic', id: topic.id, part: 'theory' }}>{topic.ptVsBr}</Markdown>
          </Collapsible>
        )}
        {topic.commonErrors && (
          <Collapsible title="Частые ошибки" icon={<TriangleAlert className="size-4" />}>
            <Markdown pt={{ kind: 'topic', id: topic.id, part: 'theory' }}>{topic.commonErrors}</Markdown>
          </Collapsible>
        )}
        </div>
        <TopicPlan
          rows={[
            { tab: 'examples', label: 'Примеры', count: topic.examples.length, unit: ['пример', 'примера', 'примеров'] },
            { tab: 'exercises', label: 'Упражнения', count: topic.exercises.length, unit: ['задание', 'задания', 'заданий'] },
            { tab: 'mini-test', label: 'Мини-тест', count: topic.miniTest.length, unit: ['вопрос', 'вопроса', 'вопросов'] },
          ]}
          last={own ? `Последний результат ${Math.round(own.lastPct * 100)}% · попыток ${own.attempts}` : 'Тема ещё не начата'}
          onGo={goTab}
        />
      </TabPanel>

      <TabPanel idBase={id} value="examples" active={tab === 'examples'} className="space-y-4">
        <ExamplesSection topic={topic} />
        <button type="button" className="btn-primary" onClick={() => goTab('exercises')}>
          К упражнениям <ArrowRight aria-hidden />
        </button>
      </TabPanel>

      <TabPanel idBase={id} value="exercises" active={tab === 'exercises'}>
        <h2 className="sr-only">Упражнения</h2>
        <PracticeSection
          topic={topic}
          exercises={topic.exercises}
          source="lesson"
          title="Упражнения"
          progress={progress.get(topic.id)}
          onSaved={() => void reload()}
          next={topic.miniTest.length ? { label: 'Мини-тест →', onClick: () => goTab('mini-test') } : undefined}
        />
      </TabPanel>

      <TabPanel idBase={id} value="mini-test" active={tab === 'mini-test'}>
        <h2 className="sr-only">Мини-тест</h2>
        <PracticeSection
          topic={topic}
          exercises={topic.miniTest}
          source="mini-test"
          title="Мини-тест"
          progress={progress.get(topic.id)}
          onSaved={() => void reload()}
        />
      </TabPanel>

      <TabPanel idBase={id} value="tutor" active={tab === 'tutor'} className="space-y-3">
        <h2 className="sr-only">Практика с агентом</h2>
        <TopicTutor topic={topic} onSaved={() => void reload()} />
      </TabPanel>
      </div>
    </article>
  )
}

/** Theory side panel (desktop): what the topic holds and the way through it — the next step is one click away. */
function TopicPlan({
  rows,
  last,
  onGo,
}: {
  rows: { tab: Tab; label: string; count: number; unit: [string, string, string] }[]
  last: string
  onGo(t: Tab): void
}) {
  return (
    <aside aria-labelledby="topic-plan" className="card space-y-4 lg:sticky lg:top-[calc(var(--sticky-top)+4.5rem)]">
      <div className="space-y-1">
        <h2 id="topic-plan">План темы</h2>
        <p className="text-sm text-ink-muted">{last}</p>
      </div>
      <ol className="divide-y divide-line text-sm">
        {rows
          .filter((r) => r.count > 0)
          .map((r, i) => (
            <li key={r.tab} className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-semibold">
                {i + 2}. {r.label}
              </span>
              <span className="text-ink-muted tabular-nums">{plural(r.count, ...r.unit)}</span>
            </li>
          ))}
      </ol>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn-primary" onClick={() => onGo('examples')}>
          Примеры <ArrowRight aria-hidden />
        </button>
        <button type="button" className="btn-secondary" onClick={() => onGo('exercises')}>
          К упражнениям
        </button>
      </div>
    </aside>
  )
}
