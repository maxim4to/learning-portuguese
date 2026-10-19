import { useMemo } from 'react'
import type { Situation } from '@/content'
import { SpeakButton } from '@/features/exercises'
import { phraseCards, wordCards } from './persist'
import { useSituationCards } from './useSituationCards'

/** «Фразы»: clichés with play + «в повторение» per phrase (cards `ph:<situationId>:<i>`). */
export function PhrasesSection({ situation }: { situation: Situation }) {
  const specs = useMemo(() => phraseCards(situation), [situation])
  const { have, busy, msg, add } = useSituationCards(situation.id, specs)
  const missing = have ? specs.filter((c) => !have.has(c.id)) : []

  if (!situation.phrases.length) return <p className="text-stone-500">В этой ситуации нет фраз.</p>

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {situation.phrases.map((p, i) => {
          const inSrs = have?.has(specs[i].id) ?? false
          return (
            <li key={i} className="card flex items-start gap-3 py-3">
              <SpeakButton text={p.pt} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-medium" lang="pt-PT">
                  {p.pt}
                </p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{p.ru}</p>
              </div>
              <button
                type="button"
                disabled={busy || inSrs || have === null}
                onClick={() => void add([specs[i]])}
                aria-label={inSrs ? `«${p.pt}» уже в повторении` : `Добавить «${p.pt}» в повторение`}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-default disabled:opacity-60 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {inSrs ? '✓' : '＋'}
                <span className="ml-1 hidden sm:inline">{inSrs ? 'в повторении' : 'в повторение'}</span>
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
          {have !== null && missing.length === 0 ? '✓ Все фразы в повторении' : `＋ Все фразы в повторение (${missing.length})`}
        </button>
        {msg && <span className="text-sm text-stone-500">{msg}</span>}
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

  if (!words.length) return <p className="text-stone-500">В этой ситуации нет словаря.</p>

  const addAll = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn-secondary"
        disabled={busy || have === null || missing.length === 0}
        onClick={() => void add(missing)}
      >
        {have !== null && missing.length === 0
          ? `✓ Все слова в повторении (${words.length})`
          : `＋ Добавить все в повторение (${missing.length})`}
      </button>
      {msg && <span className="text-sm text-stone-500">{msg}</span>}
    </div>
  )

  return (
    <div className="space-y-4">
      {addAll}

      {/* Mobile: stacked rows. */}
      <ul className="card divide-y divide-stone-200 p-0 md:hidden dark:divide-stone-800">
        {words.map((w, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2.5">
            <SpeakButton text={w.pt} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold" lang="pt-PT">
                  {w.pt}
                </span>
                <span className="text-sm text-stone-500 dark:text-stone-400">{w.ru}</span>
                {have?.has(specs[i].id) && (
                  <span className="text-xs text-brand-700 dark:text-brand-500" title="В повторении">
                    ✓
                  </span>
                )}
              </p>
              {w.example && (
                <p className="mt-1 flex items-center gap-2 text-sm text-stone-600 italic dark:text-stone-400">
                  <span className="flex-1" lang="pt-PT">
                    {w.example}
                  </span>
                  <SpeakButton text={w.example} className="not-italic [&_button]:h-8 [&_button]:min-w-8" />
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Desktop: table. */}
      <div className="card hidden overflow-x-auto p-0 md:block">
        <table className="w-full border-collapse text-left text-[15px] leading-snug">
          <thead className="bg-stone-100 dark:bg-stone-800/70">
            <tr>
              <th className="w-12 px-3 py-2" aria-label="Прослушать" />
              <th className="px-3 py-2 font-semibold">Português</th>
              <th className="px-3 py-2 font-semibold">Перевод</th>
              <th className="px-3 py-2 font-semibold">Пример</th>
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => (
              <tr key={i} className="border-t border-stone-200 even:bg-stone-50 dark:border-stone-800 dark:even:bg-stone-900/60">
                <td className="px-3 py-2 align-top">
                  <SpeakButton text={w.pt} />
                </td>
                <td className="px-3 py-2 align-top font-semibold whitespace-nowrap" lang="pt-PT">
                  {w.pt}
                  {have?.has(specs[i].id) && (
                    <span className="ml-1.5 text-xs font-normal text-brand-700 dark:text-brand-500" title="В повторении">
                      ✓
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-stone-600 dark:text-stone-300">{w.ru}</td>
                <td className="px-3 py-2 align-top">
                  {w.example && (
                    <span className="flex items-start gap-2">
                      <span className="flex-1 text-stone-700 italic dark:text-stone-300" lang="pt-PT">
                        {w.example}
                      </span>
                      <SpeakButton text={w.example} className="[&_button]:h-8 [&_button]:min-w-8" />
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
