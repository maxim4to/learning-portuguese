import { useEffect, type KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getSituation, type Situation } from '@/content'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'
import { useProgressMap } from '@/features/lessons/useTopicProgress'
import { DialogueSection } from './DialogueSection'
import { SituationPractice } from './SituationPractice'
import { PhrasesSection, VocabSection } from './StudySections'
import { WritingSection } from './WritingSection'

const TABS = ['dialogue', 'phrases', 'vocab', 'exercises', 'writing'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  dialogue: 'Диалог',
  phrases: 'Фразы',
  vocab: 'Лексика',
  exercises: 'Упражнения',
  writing: 'Письмо',
}

export function SituationPage() {
  const { id = '' } = useParams()
  const situation = getSituation(id)
  if (!situation) {
    return (
      <div className="space-y-3">
        <h1>Ситуация не найдена</h1>
        <p className="text-stone-500">
          Ситуации «{id}» нет в курсе — возможно, ссылка устарела.
        </p>
        <Link to="/situations">← К ситуациям</Link>
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

  // Mobile: keep the active tab visible in the horizontally scrolling tab bar.
  useEffect(() => {
    const el = document.getElementById(`sit-tab-${tab}`)
    const bar = el?.parentElement
    if (!el || !bar) return
    const l = el.offsetLeft // the sticky bar is the offsetParent
    if (l < bar.scrollLeft || l + el.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: l - 16, behavior: 'smooth' })
  }, [tab])

  const setTab = (t: Tab) => setParams(t === 'dialogue' ? {} : { tab: t }, { replace: true })
  const goTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
        {TAB_LABEL[n]} →
      </button>
    )
  }

  // Keyboard: ←/→ move between tabs when a tab has focus (WAI-ARIA tabs pattern).
  function onTabKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = tabs.indexOf(tab)
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    setTab(n)
    document.getElementById(`sit-tab-${n}`)?.focus()
    e.preventDefault()
  }

  return (
    <article className="space-y-5">
      <header className="space-y-3">
        <nav aria-label="Навигация" className="text-sm text-stone-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link to="/library" className="no-underline hover:underline">
                Материалы
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li>
              <Link to="/situations" className="no-underline hover:underline">
                Ситуации
              </Link>
            </li>
          </ol>
        </nav>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={situation.level} />
            <StatusBadge status={own?.status ?? 'not-started'} />
            {own && (
              <span className="text-xs text-stone-500">
                последний результат {Math.round(own.lastPct * 100)}% · попыток {own.attempts}
              </span>
            )}
          </div>
          <h1 className="text-[1.6rem] leading-tight sm:text-3xl">{situation.title}</h1>
          <p className="text-lg text-stone-500 italic dark:text-stone-400" lang="pt-PT">
            {situation.titlePt}
          </p>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Разделы ситуации"
        onKeyDown={onTabKey}
        className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur [scrollbar-width:none] md:top-[53px] md:mx-0 md:rounded-xl md:border md:px-1.5 md:py-1.5 dark:border-stone-800 dark:bg-stone-950/95"
      >
        {tabs.map((t) => (
          <button
            key={t}
            id={`sit-tab-${t}`}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-controls={`sit-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition sm:px-3 ${
              tab === t
                ? 'bg-brand-700 text-white'
                : 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
            }`}
          >
            {TAB_LABEL[t]}
            {count[t] !== undefined && <span className="hidden opacity-70 sm:inline"> · {count[t]}</span>}
          </button>
        ))}
      </div>

      {/* All panels stay mounted so dialogue state / an exercise run survive tab switches. */}
      <section id="sit-panel-dialogue" role="tabpanel" aria-labelledby="sit-tab-dialogue" hidden={tab !== 'dialogue'} className="space-y-4">
        <DialogueSection situation={situation} />
        {nextButton('dialogue')}
      </section>

      <section id="sit-panel-phrases" role="tabpanel" aria-labelledby="sit-tab-phrases" hidden={tab !== 'phrases'} className="space-y-4">
        <PhrasesSection situation={situation} />
        {nextButton('phrases')}
      </section>

      <section id="sit-panel-vocab" role="tabpanel" aria-labelledby="sit-tab-vocab" hidden={tab !== 'vocab'} className="space-y-4">
        <VocabSection situation={situation} />
        {nextButton('vocab')}
      </section>

      <section id="sit-panel-exercises" role="tabpanel" aria-labelledby="sit-tab-exercises" hidden={tab !== 'exercises'}>
        <SituationPractice
          situation={situation}
          progress={own}
          onSaved={() => void reload()}
          next={nextTab('exercises') ? { label: `${TAB_LABEL[nextTab('exercises')!]} →`, onClick: () => goTab(nextTab('exercises')!) } : undefined}
        />
      </section>

      {situation.writingTask && (
        <section id="sit-panel-writing" role="tabpanel" aria-labelledby="sit-tab-writing" hidden={tab !== 'writing'}>
          <WritingSection situation={situation} />
        </section>
      )}
    </article>
  )
}
