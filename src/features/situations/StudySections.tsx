import { useMemo } from 'react'
import type { Situation } from '@/content'
import { Check, Plus } from 'lucide-react'
import { SpeakButton } from '@/components/SpeakButton'
import { phraseCards, wordCards } from './persist'
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
                <p className="text-[1.0625rem] leading-snug font-semibold" lang="pt-PT">
                  {p.pt}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{p.ru}</p>
              </div>
              <button
                type="button"
                disabled={busy || inSrs || have === null}
                onClick={() => void add([specs[i]])}
                aria-label={inSrs ? `«${p.pt}» уже в повторении` : `Добавить «${p.pt}» в повторение`}
                className={`inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-sm font-semibold transition-colors disabled:cursor-default ${inSrs ? 'border-transparent bg-brand-soft text-brand-ink' : 'border-line-strong text-ink-muted hover:border-brand hover:bg-brand-soft hover:text-brand-ink'}`}
              >
                {inSrs ? <Check aria-hidden className="size-4.5" /> : <Plus aria-hidden className="size-4.5" />}
                <span className="hidden sm:inline">{inSrs ? 'в повторении' : 'в повторение'}</span>
              </button>
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

/** «Лексика»: table pt / ru / example with play + «добавить все в повторение» (cards `w:<situationId>:<i>`). */
export function VocabSection({ situation }: { situation: Situation }) {
  const specs = useMemo(() => wordCards(situation), [situation])
  const { have, busy, msg, add } = useSituationCards(situation.id, specs)
  const missing = have ? specs.filter((c) => !have.has(c.id)) : []
  const words = situation.vocab

  if (!words.length) return <p className="text-ink-muted">В этой ситуации нет словаря.</p>

  const addAll = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn-secondary"
        disabled={busy || have === null || missing.length === 0}
        onClick={() => void add(missing)}
      >
        {have !== null && missing.length === 0 ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
        {have !== null && missing.length === 0
          ? `Все слова в повторении (${words.length})`
          : `Добавить все в повторение (${missing.length})`}
      </button>
      {msg && <span role="status" className="text-sm text-ink-muted">{msg}</span>}
    </div>
  )

  return (
    <div className="space-y-4">
      {addAll}

      {/* Mobile: stacked rows. */}
      <ul className="card divide-y divide-line p-0 md:hidden">
        {words.map((w, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2.5">
            <SpeakButton text={w.pt} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold" lang="pt-PT">
                  {w.pt}
                </span>
                <span className="text-sm text-ink-muted">{w.ru}</span>
                {have?.has(specs[i].id) && (
                  <span className="text-brand-ink" title="В повторении">
                    <Check aria-hidden className="inline size-4" />
                    <span className="sr-only">в повторении</span>
                  </span>
                )}
              </p>
              {w.example && (
                <p className="mt-1 flex items-center gap-2 font-serif text-sm text-ink-muted italic">
                  <span className="flex-1" lang="pt-PT">
                    {w.example}
                  </span>
                  <SpeakButton text={w.example} size="sm" variant="ghost" ariaLabel="Прослушать пример" className="not-italic" />
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table. */}
      <div className="card hidden overflow-x-auto p-0 md:block">
        <table className="w-full border-collapse text-left text-[0.9375rem] leading-snug">
          <thead className="bg-surface-2 text-sm text-ink-muted">
            <tr>
              <th className="w-14 px-3 py-2"><span className="sr-only">Прослушать</span></th>
              <th className="px-3 py-2 font-semibold">Português</th>
              <th className="px-3 py-2 font-semibold">Перевод</th>
              <th className="px-3 py-2 font-semibold">Пример</th>
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-2 align-top">
                  <SpeakButton text={w.pt} />
                </td>
                <td className="px-3 py-2 pt-4 align-top font-semibold whitespace-nowrap" lang="pt-PT">
                  {w.pt}
                  {have?.has(specs[i].id) && (
                    <span className="ml-1.5 text-brand-ink" title="В повторении">
                      <Check aria-hidden className="inline size-4" />
                      <span className="sr-only">в повторении</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 pt-4 align-top text-ink-muted">{w.ru}</td>
                <td className="px-3 py-2 align-top">
                  {w.example && (
                    <span className="flex items-start gap-2">
                      <span className="flex-1 pt-2 font-serif italic" lang="pt-PT">
                        {w.example}
                      </span>
                      <SpeakButton text={w.example} size="sm" variant="ghost" ariaLabel="Прослушать пример" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
