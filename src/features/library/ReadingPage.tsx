import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getReadingText, type ReadingText } from '@/content'
import { Check, Play, Plus, Sparkles, Square } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { SpeakButton } from '@/components/SpeakButton'
import { LevelBadge } from '@/components/StatusBadge'
import { cx } from '@/components/cx'
import { useSpeak } from '@/features/exercises'
import { ReadingTutor } from '@/features/tutor/panels'
import { Pt } from '@/features/words/Pt'
import { useContentWords } from '@/features/words/useContentWords'
import { makeSegmenter } from './highlight'
import { ReadingQuestions } from './ReadingQuestions'
import { AddCardButton, NotFound } from './ui'
import { plural } from './format'
import { practicePath } from '@/features/practice/paths'

export function ReadingPage() {
  const { id = '' } = useParams()
  const text = getReadingText(id)
  if (!text) return <NotFound what="Текст" back={{ to: practicePath('reading'), label: 'Практика · Чтение' }} />
  return <ReadingView key={text.id} text={text} />
}

/** Sequential «read all» over paragraphs; `cancel()` stops it (e.g. when a single paragraph is played). */
function useReadAll(paragraphs: readonly string[]) {
  const { speak, stop } = useSpeak()
  const [current, setCurrent] = useState<number | null>(null)
  const run = useRef(0)

  const cancel = useCallback(() => {
    run.current++
    setCurrent(null)
  }, [])

  const start = useCallback(async () => {
    const my = ++run.current
    for (let i = 0; i < paragraphs.length; i++) {
      if (run.current !== my) return
      setCurrent(i)
      const source = await speak(paragraphs[i])
      if (source === 'none') break
    }
    if (run.current === my) setCurrent(null)
  }, [paragraphs, speak])

  const stopAll = useCallback(() => {
    cancel()
    stop()
  }, [cancel, stop])

  // Unmount: make a pending loop exit instead of speaking the next paragraph.
  useEffect(() => () => void run.current++, [])

  return { current, start, stop: stopAll, cancel }
}

function ReadingView({ text }: { text: ReadingText }) {
  const segment = useMemo(() => makeSegmenter(text.glossary), [text.glossary])
  const paragraphs = useMemo(() => text.paragraphs.map((p) => segment(p)), [text.paragraphs, segment])
  // Glossary words go to the personal dictionary (source `reading:<id>:glossary:<i>`), like situation vocab.
  const glossWords = useMemo(() => text.glossary.map((g) => ({ pt: g.word, ru: g.ru })), [text.glossary])
  const dict = useContentWords(glossWords, {
    themeKey: `reading:${text.id}`,
    src: `reading:${text.id}:glossary`,
    indexed: true,
    level: text.level,
  })
  const reader = useReadAll(text.paragraphs)

  const allAdded = dict.ready && dict.missing.length === 0
  const reading = reader.current !== null

  return (
    <article className="page">
      <PageHeader
        back={{ to: practicePath('reading'), label: 'Практика · Чтение' }}
        meta={
          <>
            <LevelBadge level={text.level} />
            <span>Чтение · {plural(text.paragraphs.length, 'абзац', 'абзаца', 'абзацев')}</span>
          </>
        }
        title={text.title}
        titleLang="pt-PT"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => (reading ? reader.stop() : void reader.start())}>
          {reading ? <Square aria-hidden className="size-4.5 fill-current" /> : <Play aria-hidden className="size-4.5 fill-current" />}
          {reading ? 'Остановить' : 'Прочитать весь текст'}
        </button>
        {text.glossary.length > 0 && (
          <span className="text-sm text-ink-muted">
            Нажмите на любое слово — перевод и «в словарь»;{' '}
            <span className="border-b-2 border-dotted border-azulejo">подчёркнуты</span> слова словарика
          </span>
        )}
        <a href="#tutor" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold sm:ml-auto">
          <Sparkles aria-hidden className="size-4 text-terracotta" /> Практика с агентом
        </a>
      </div>

      {/* Desktop: the text at a readable measure beside its glossary; stacked on phones. */}
      <div className={text.glossary.length > 0 ? 'page-grid' : undefined}>
      <section className="card min-w-0 space-y-1" lang="pt-PT">
        {paragraphs.map((segs, pi) => (
          <div
            key={pi}
            className={cx(
              '-mx-2 flex items-start gap-3 rounded-control px-2 py-2 transition-colors',
              reader.current === pi && 'bg-azulejo-soft',
            )}
          >
            <span onClickCapture={reader.cancel} className="pt-0.5">
              <SpeakButton text={text.paragraphs[pi]} size="sm" ariaLabel={`Прослушать абзац ${pi + 1}`} />
            </span>
            {/* Plain pt text: tap / double-click / select a word → word card (glossary words are only marked);
                focus + Enter → «Все слова фразы». */}
            <Pt
              as="p"
              id={`p-${pi}`}
              tabIndex={0}
              src={{ kind: 'reading', id: text.id, part: 'paragraph', index: pi }}
              className="measure min-w-0 flex-1 scroll-mt-28 rounded-sm text-base leading-7"
            >
              {segs.map((s, si) =>
                s.gi === undefined ? (
                  <span key={si}>{s.text}</span>
                ) : (
                  <span key={si} className="border-b-2 border-dotted border-azulejo/70 [box-decoration-break:clone]">
                    {s.text}
                  </span>
                ),
              )}
            </Pt>
          </div>
        ))}
      </section>

      {text.glossary.length > 0 && (
        <section aria-labelledby="reading-gloss" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="reading-gloss">Словарик</h2>
            <button
              type="button"
              className="btn-secondary"
              disabled={dict.busy || !dict.ready || allAdded}
              onClick={() => void dict.add(dict.missing)}
            >
              {allAdded ? <Check aria-hidden className="size-4.5 text-brand" /> : <Plus aria-hidden className="size-4.5" />}
              {allAdded ? 'Все в словаре' : 'Добавить все в словарь'}
            </button>
          </div>
          <ul className="card divide-y divide-line p-0">
            {text.glossary.map((g, i) => (
              <li key={i} id={`gl-${i}`} className="flex scroll-mt-28 items-center gap-3 px-3 py-2">
                <span onClickCapture={reader.cancel}>
                  <SpeakButton text={g.word} size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <Pt as="b" src={{ kind: 'reading', id: text.id, part: 'glossary', index: i }} ru={g.ru} className="font-semibold">
                    {g.word}
                  </Pt>
                  <span className="text-ink-subtle"> — </span>
                  <span className="text-ink-muted">{g.ru}</span>
                </span>
                <AddCardButton
                  variant="text"
                  target="words"
                  name={g.word}
                  added={!!dict.saved?.[i]}
                  disabled={dict.busy || !dict.ready}
                  onClick={() => void dict.add([i])}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>

      {text.questions.length > 0 && (
        <section id="questions" className="scroll-mt-28 space-y-3">
          <h2>Вопросы к тексту</h2>
          <ReadingQuestions text={text} />
        </section>
      )}

      <ReadingTutor text={text} />
    </article>
  )
}
