import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { Situation } from '@/content'
import { Check, Plus } from 'lucide-react'
import { SpeakButton } from '@/components/SpeakButton'
import { AddCardButton } from '@/features/library/ui'
import { Pt } from '@/features/words/Pt'
import type { PtSource } from '@/features/words/source'
import { useContentWords } from '@/features/words/useContentWords'
import { phraseCards } from './persist'
import { useSituationCards } from './useSituationCards'

/** «Фразы»: clichés with play + «в повторение» per phrase (cards `ph:<situationId>:<i>`). */
export function PhrasesSection({ situation }: { situation: Situation }) {
  const specs = useMemo(() => phraseCards(situation), [situation])
  const { have, busy, msg, add } = useSituationCards(situation.id, specs)
  const missing = have ? specs.filter((c) => !have.has(c.id)) : []

  if (!situation.phrases.length) return <p className="text-ink-muted">В этой ситуации нет фраз.</p>

  return (
    <div className="space-y-4">
      <ul className="card divide-y divide-line p-0">
        {situation.phrases.map((p, i) => {
          const inSrs = have?.has(specs[i].id) ?? false
          return (
            <li key={i} className="flex items-start gap-3 px-3 py-3 sm:px-4">
              <SpeakButton text={p.pt} />
              <div className="min-w-0 flex-1 pt-1">
                <Pt
                  as="p"
                  id={`ph-${i}`}
                  src={{ kind: 'situation', id: situation.id, part: 'phrases', index: i }}
                  ru={p.ru}
                  className="scroll-mt-28 text-base leading-snug font-semibold"
                >
                  {p.pt}
                </Pt>
                <p className="mt-0.5 text-sm text-ink-muted">{p.ru}</p>
              </div>
              <AddCardButton name={p.pt} added={inSrs} disabled={busy || have === null} onClick={() => void add([specs[i]])} />
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || have === null || missing.length === 0}
          onClick={() => void add(missing)}
        >
          {have !== null && missing.length === 0 ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
          {have !== null && missing.length === 0 ? 'Все фразы в повторении' : `Все фразы в повторение (${missing.length})`}
        </button>
        {msg && <span role="status" className="text-sm text-ink-muted">{msg}</span>}
      </div>
    </div>
  )
}

/**
 * «Лексика»: pt / ru / example with play + «в словарь» per word and «Добавить все в словарь»
 * (personal dictionary entries, source `situation:<id>:vocab:<i>`; phrases above stay SRS cards).
 */
export function VocabSection({ situation }: { situation: Situation }) {
  const words = situation.vocab
  const dict = useContentWords(words, {
    themeKey: `situation:${situation.id}`,
    src: `situation:${situation.id}:vocab`,
    indexed: true,
    level: situation.level,
  })
  const allAdded = dict.ready && dict.missing.length === 0
  const src = (i: number): PtSource => ({ kind: 'situation', id: situation.id, part: 'vocab', index: i })

  if (!words.length) return <p className="text-ink-muted">В этой ситуации нет словаря.</p>

  const addAll = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        className="btn-secondary"
        disabled={dict.busy || !dict.ready || allAdded}
        onClick={() => void dict.add(dict.missing)}
      >
        {allAdded ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
        {allAdded ? `Все слова в словаре (${words.length})` : `Добавить все в словарь${dict.ready ? ` (${dict.missing.length})` : ''}`}
      </button>
      {allAdded && (
        <Link to="/words" className="inline-flex min-h-11 items-center text-sm font-semibold">
          Открыть «Мой словарь»
        </Link>
      )}
    </div>
  )

  const addButton = (i: number) => (
    <AddCardButton
      variant="text"
      target="words"
      name={words[i].pt}
      added={!!dict.saved?.[i]}
      disabled={dict.busy || !dict.ready}
      onClick={() => void dict.add([i])}
    />
  )

  return (
    <div className="space-y-4">
      {addAll}

      {/* Mobile: stacked rows. */}
      <ul className="card divide-y divide-line p-0 md:hidden">
        {words.map((w, i) => (
          <li key={i} data-anchor={`voc-${i}`} className="flex scroll-mt-28 items-start gap-2 py-2.5 pr-1.5 pl-3">
            <SpeakButton text={w.pt} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Pt src={src(i)} ru={w.ru} className="font-semibold">
                  {w.pt}
                </Pt>
                <span className="text-sm text-ink-muted">{w.ru}</span>
              </p>
              {w.example && (
                <p className="mt-1 flex items-center gap-2 font-pt text-sm text-ink-muted">
                  <Pt src={src(i)} className="flex-1">
                    {w.example}
                  </Pt>
                  <SpeakButton text={w.example} size="sm" variant="ghost" ariaLabel="Прослушать пример" className="not-italic" />
                </p>
              )}
            </div>
            {addButton(i)}
          </li>
        ))}
      </ul>

      {/* Desktop: table. */}
      <div className="card hidden overflow-x-auto p-0 md:block">
        <table className="w-full border-collapse text-left text-sm leading-snug">
          <thead className="text-sm text-ink-muted">
            <tr className="border-b border-line-strong">
              <th className="w-14 px-3 py-2"><span className="sr-only">Прослушать</span></th>
              <th className="px-3 py-2 font-semibold">Português</th>
              <th className="px-3 py-2 font-semibold">Перевод</th>
              <th className="px-3 py-2 font-semibold">Пример</th>
              <th className="w-14 px-3 py-2"><span className="sr-only">В словарь</span></th>
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => (
              <tr key={i} data-anchor={`voc-${i}`} className="scroll-mt-28 border-t border-line first:border-t-0">
                <td className="px-3 py-2 align-top">
                  <SpeakButton text={w.pt} />
                </td>
                <td className="px-3 py-2 pt-4 align-top font-semibold whitespace-nowrap">
                  <Pt src={src(i)} ru={w.ru}>
                    {w.pt}
                  </Pt>
                </td>
                <td className="px-3 py-2 pt-4 align-top text-ink-muted">{w.ru}</td>
                <td className="px-3 py-2 align-top">
                  {w.example && (
                    <span className="flex items-start gap-2">
                      <Pt src={src(i)} className="flex-1 pt-2 font-pt">
                        {w.example}
                      </Pt>
                      <SpeakButton text={w.example} size="sm" variant="ghost" ariaLabel="Прослушать пример" />
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 align-top">{addButton(i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
