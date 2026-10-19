import { createElement, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, SearchX, Sparkles } from 'lucide-react'
import { getSituation, type Situation } from '@/content'
import { ButtonLink } from '@/components/Button'
import { cx, scrollBehavior } from '@/components/cx'
import { EmptyState } from '@/components/EmptyState'
import { LessonHeader } from '@/components/LessonHeader'
import { TabPanel, Tabs } from '@/components/Tabs'
import { sceneIcon, sceneTint } from './sceneIcon'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { SituationTutor } from '@/features/tutor/panels'
import { DialogueSection } from './DialogueSection'
import { SituationPractice } from './SituationPractice'
import { PhrasesSection, VocabSection } from './StudySections'
import { WritingSection } from './WritingSection'
import { practicePath } from '@/features/practice/paths'

const TABS = ['dialogue', 'phrases', 'vocab', 'exercises', 'writing', 'tutor'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  dialogue: 'Диалог',
  phrases: 'Фразы',
  vocab: 'Лексика',
  exercises: 'Упражнения',
  writing: 'Письмо',
  tutor: 'С агентом',
}

export function SituationPage() {
  const { id = '' } = useParams()
  const situation = getSituation(id)
  if (!situation) {
    return (
      <div className="card">
        <EmptyState
          icon={<SearchX className="size-7" />}
          tone="neutral"
          title="Ситуация не найдена"
          text={`Ситуации «${id}» нет в курсе — возможно, ссылка устарела.`}
          action={<ButtonLink to={practicePath('situations')}>К ситуациям</ButtonLink>}
        />
      </div>
    )
  }
  return <SituationModule key={situation.id} situation={situation} />
}

function SituationModule({ situation }: { situation: Situation }) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tabs = TABS.filter((t) => t !== 'writing' || situation.writingTask)
  const tab: Tab = tabs.includes(raw as Tab) ? (raw as Tab) : 'dialogue'
  const { map: progress, reload } = useProgressMap()
  const own = progress.get(situation.id)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [situation.id])

  const setTab = (t: Tab) => setParams(t === 'dialogue' ? {} : { tab: t }, { replace: true })
  const goTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }
  const nextTab = (t: Tab): Tab | undefined => tabs[tabs.indexOf(t) + 1]

  const count: Partial<Record<Tab, number>> = {
    dialogue: situation.dialogue.length,
    phrases: situation.phrases.length,
    vocab: situation.vocab.length,
    exercises: situation.exercises.length,
  }

  function nextButton(from: Tab) {
    const n = nextTab(from)
    if (!n) return null
    return (
      <button type="button" className="btn-primary" onClick={() => goTab(n)}>
        {TAB_LABEL[n]} <ArrowRight aria-hidden />
      </button>
    )
  }

  const id = 'sit'

  return (
    <article className="flex min-w-0 flex-col gap-2">
      <LessonHeader
        back={{ to: practicePath('situations'), label: 'Ситуации', title: 'Практика · Ситуации' }}
        level={situation.level}
        icon={
          <span aria-hidden className={cx('grid size-8 shrink-0 place-items-center rounded-full', sceneTint(situation.id))}>
            {createElement(sceneIcon(situation.id), { className: 'size-4.5', strokeWidth: 1.9 })}
          </span>
        }
        title={situation.title}
        below={
          tab === 'dialogue' && (
            <span className="font-pt" lang="pt-PT">
              {situation.titlePt}
            </span>
          )
        }
      />

      <div className="space-y-4">
      <Tabs
        idBase={id}
        label="Разделы ситуации"
        sticky
        value={tab}
        onChange={setTab}
        items={tabs.map((t) => ({
          value: t,
          label:
            t === 'tutor' ? (
              <>
                <Sparkles aria-hidden className="size-4 text-terracotta" />
                {TAB_LABEL[t]}
              </>
            ) : (
              TAB_LABEL[t]
            ),
          meta: count[t] !== undefined ? <span className="hidden sm:inline">{count[t]}</span> : undefined,
        }))}
      />

      {/* All panels stay mounted so dialogue state / an exercise run survive tab switches. */}
      <TabPanel idBase={id} value="dialogue" active={tab === 'dialogue'} className="space-y-4">
        <DialogueSection situation={situation} />
        {nextButton('dialogue')}
      </TabPanel>

      <TabPanel idBase={id} value="phrases" active={tab === 'phrases'} className="space-y-4">
        <PhrasesSection situation={situation} />
        {nextButton('phrases')}
      </TabPanel>

      <TabPanel idBase={id} value="vocab" active={tab === 'vocab'} className="space-y-4">
        <VocabSection situation={situation} />
        {nextButton('vocab')}
      </TabPanel>

      <TabPanel idBase={id} value="exercises" active={tab === 'exercises'}>
        <h2 className="sr-only">Упражнения</h2>
        <SituationPractice
          situation={situation}
          progress={own}
          onSaved={() => void reload()}
          next={nextTab('exercises') ? { label: TAB_LABEL[nextTab('exercises')!], onClick: () => goTab(nextTab('exercises')!) } : undefined}
        />
      </TabPanel>

      {situation.writingTask && (
        <TabPanel idBase={id} value="writing" active={tab === 'writing'}>
          <WritingSection situation={situation} />
        </TabPanel>
      )}

      <TabPanel idBase={id} value="tutor" active={tab === 'tutor'}>
        <h2 className="sr-only">Практика с агентом</h2>
        <SituationTutor situation={situation} onSaved={() => void reload()} />
      </TabPanel>
      </div>
    </article>
  )
}
