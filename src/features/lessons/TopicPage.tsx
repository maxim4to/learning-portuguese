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
    <article className="space-y-5">
      <TopicHeader topic={topic} progress={progress} />

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
      <TabPanel idBase={id} value="theory" active={tab === 'theory'} className="space-y-4">
        <div className="card sm:p-7">
          <Markdown>{topic.theory}</Markdown>
        </div>
        {topic.ptVsBr && (
          <Collapsible title="PT vs BR" icon={<Flag className="size-4" />}>
            <Markdown>{topic.ptVsBr}</Markdown>
          </Collapsible>
        )}
        {topic.commonErrors && (
          <Collapsible title="Частые ошибки" icon={<TriangleAlert className="size-4" />}>
            <Markdown>{topic.commonErrors}</Markdown>
          </Collapsible>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-primary" onClick={() => goTab('examples')}>
            Примеры <ArrowRight aria-hidden className="size-5" />
          </button>
          <button type="button" className="btn-secondary" onClick={() => goTab('exercises')}>
            К упражнениям
          </button>
        </div>
      </TabPanel>

      <TabPanel idBase={id} value="examples" active={tab === 'examples'} className="space-y-4">
        <ExamplesSection topic={topic} />
        <button type="button" className="btn-primary" onClick={() => goTab('exercises')}>
          К упражнениям <ArrowRight aria-hidden className="size-5" />
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
    </article>
  )
}
