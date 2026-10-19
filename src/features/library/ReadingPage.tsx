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
import { glossaryCardSpecs, useLibraryCards } from './cards'
import { GlossaryPopover, type PopoverAnchor } from './GlossaryPopover'
import { makeSegmenter } from './highlight'
import { ReadingQuestions } from './ReadingQuestions'
import { AddCardButton, NotFound } from './ui'
import { plural } from './format'

export function ReadingPage() {
  const { id = '' } = useParams()
  const text = getReadingText(id)
  if (!text) return <NotFound what="Текст" />
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
  const specs = useMemo(() => glossaryCardSpecs(text), [text])
  const cards = useLibraryCards(text.id, specs)
  const reader = useReadAll(text.paragraphs)
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)
  const closePopover = useCallback(() => setAnchor(null), [])

  const missing = cards.have ? specs.filter((s) => !cards.have!.has(s.id)) : specs
  const allAdded = cards.have !== null && missing.length === 0
  const reading = reader.current !== null
  const openEntry = anchor ? text.glossary[anchor.gi] : undefined

  const openWord = (el: HTMLElement, gi: number, viaKey = false) =>
    setAnchor((a) => (a?.el === el ? null : { gi, rect: el.getBoundingClientRect(), el, viaKey }))

  return (
    <article className="page">
      <PageHeader
        back={{ to: '/library', label: 'Библиотека' }}
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
            <span className="border-b-2 border-dotted border-azulejo">Подчёркнутые</span> слова — нажмите для перевода
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
            <p className="measure min-w-0 flex-1 text-base leading-7">
              {segs.map((s, si) =>
                s.gi === undefined ? (
                  <span key={si}>{s.text}</span>
                ) : (
                  // A real inline element (a <button> is always laid out as inline-block, which broke lines — audit P0-12).
                  <span
                    key={si}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    aria-expanded={anchor?.gi === s.gi}
                    onClick={(e) => openWord(e.currentTarget, s.gi!)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openWord(e.currentTarget, s.gi!, true)
                      }
                    }}
                    className={cx(
                      'cursor-pointer rounded-sm border-b-2 border-dotted border-azulejo/70 [box-decoration-break:clone] transition-colors hover:bg-azulejo-soft',
                      anchor?.gi === s.gi && 'bg-azulejo-soft',
                    )}
                  >
                    {s.text}
                  </span>
                ),
              )}
            </p>
          </div>
        ))}
      </section>

      {anchor && openEntry && (
        <GlossaryPopover
          anchor={anchor}
          word={openEntry.word}
          ru={openEntry.ru}
          added={!!cards.have?.has(specs[anchor.gi].id)}
          busy={cards.busy || cards.have === null}
          onAdd={() => void cards.add([specs[anchor.gi]])}
          onClose={closePopover}
          onSpeak={reader.cancel}
        />
      )}

      {text.glossary.length > 0 && (
        <section aria-labelledby="reading-gloss" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="reading-gloss">Словарик</h2>
            <button
              type="button"
              className="btn-secondary"
              disabled={cards.busy || cards.have === null || allAdded}
              onClick={() => void cards.add(missing)}
            >
              {allAdded ? <Check aria-hidden className="size-4.5 text-brand" /> : <Plus aria-hidden className="size-4.5" />}
              {allAdded ? 'Все в повторении' : 'Добавить все в повторение'}
            </button>
          </div>
          {cards.msg && (
            <p className="text-sm text-ink-muted" role="status">
              {cards.msg}
            </p>
          )}
          <ul className="card divide-y divide-line p-0">
            {text.glossary.map((g, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span onClickCapture={reader.cancel}>
                  <SpeakButton text={g.word} size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="font-semibold" lang="pt-PT">
                    {g.word}
                  </b>
                  <span className="text-ink-subtle"> — </span>
                  <span className="text-ink-muted">{g.ru}</span>
                </span>
                <AddCardButton
                  added={!!cards.have?.has(specs[i].id)}
                  disabled={cards.busy || cards.have === null}
                  onClick={() => void cards.add([specs[i]])}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>

      {text.questions.length > 0 && (
        <section className="space-y-3">
          <h2>Вопросы к тексту</h2>
          <ReadingQuestions text={text} />
        </section>
      )}

      <ReadingTutor text={text} />
    </article>
  )
}
