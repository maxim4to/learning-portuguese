import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getReadingText, type ReadingText } from '@/content'
import { LevelBadge } from '@/components/StatusBadge'
import { SpeakButton, useSpeak } from '@/features/exercises'
import { glossaryCardSpecs, useLibraryCards } from './cards'
import { GlossaryPopover, type PopoverAnchor } from './GlossaryPopover'
import { makeSegmenter } from './highlight'
import { ReadingQuestions } from './ReadingQuestions'
import { AddCardButton, BackLink, NotFound } from './ui'
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

  return (
    <article className="space-y-6">
      <BackLink />
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LevelBadge level={text.level} />
          <span className="text-sm text-stone-500">
            Чтение · {plural(text.paragraphs.length, 'абзац', 'абзаца', 'абзацев')}
          </span>
        </div>
        <h1 lang="pt-PT">{text.title}</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => (reading ? reader.stop() : void reader.start())}>
          <span aria-hidden>{reading ? '■' : '▶'}</span> {reading ? 'Остановить' : 'Прочитать весь текст'}
        </button>
        {text.glossary.length > 0 && (
          <span className="text-sm text-stone-500">
            <span className="border-b-2 border-dotted border-brand-600">Подчёркнутые</span> слова — нажмите для перевода
          </span>
        )}
      </div>

      <section className="card space-y-1 sm:p-6" lang="pt-PT">
        {paragraphs.map((segs, pi) => (
          <div
            key={pi}
            className={`-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 transition-colors ${
              reader.current === pi ? 'bg-brand-50 dark:bg-brand-800/20' : ''
            }`}
          >
            <span onClickCapture={reader.cancel} className="pt-0.5">
              <SpeakButton text={text.paragraphs[pi]} />
            </span>
            <p className="min-w-0 flex-1 text-[18px] leading-relaxed">
              {segs.map((s, si) =>
                s.gi === undefined ? (
                  <span key={si}>{s.text}</span>
                ) : (
                  <button
                    key={si}
                    type="button"
                    aria-haspopup="dialog"
                    onClick={(e) => {
                      const el = e.currentTarget
                      setAnchor((a) => (a?.el === el ? null : { gi: s.gi!, rect: el.getBoundingClientRect(), el }))
                    }}
                    className={`inline cursor-pointer rounded-sm border-b-2 border-dotted border-brand-600 p-0 text-left align-baseline [font:inherit] transition hover:bg-brand-50 dark:border-brand-500 dark:hover:bg-brand-800/30 ${
                      anchor?.gi === s.gi ? 'bg-brand-100 dark:bg-brand-800/40' : ''
                    }`}
                  >
                    {s.text}
                  </button>
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
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Словарик</h2>
            <button
              type="button"
              className="btn-secondary py-1.5 text-sm"
              disabled={cards.busy || cards.have === null || allAdded}
              onClick={() => void cards.add(missing)}
            >
              {allAdded ? '✓ Все в повторении' : 'Добавить все в повторение'}
            </button>
          </div>
          {cards.msg && (
            <p className="text-sm text-stone-500" role="status">
              {cards.msg}
            </p>
          )}
          <ul className="card divide-y divide-stone-200 p-0 dark:divide-stone-800">
            {text.glossary.map((g, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span onClickCapture={reader.cancel}>
                  <SpeakButton text={g.word} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="font-medium" lang="pt-PT">
                    {g.word}
                  </b>
                  <span className="text-stone-400"> — </span>
                  <span className="text-stone-700 dark:text-stone-300">{g.ru}</span>
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

      {text.questions.length > 0 && (
        <section className="space-y-3">
          <h2>Вопросы к тексту</h2>
          <ReadingQuestions text={text} />
        </section>
      )}
    </article>
  )
}
