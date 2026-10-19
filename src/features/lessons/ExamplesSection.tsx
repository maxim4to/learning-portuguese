import { useEffect, useState } from 'react'
import type { Topic } from '@/content'
import { useRepository } from '@/data'
import { SpeakButton } from '@/features/exercises'
import { addExampleCards, countExampleCards } from './persist'

/** «Добавить примеры в повторение» — creates grammar SRS cards from the topic examples. */
export function AddExamplesButton({ topic }: { topic: Topic }) {
  const repo = useRepository()
  const [have, setHave] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    countExampleCards(repo, topic).then((n) => alive && setHave(n))
    return () => {
      alive = false
    }
  }, [repo, topic])

  if (!topic.examples.length) return null
  const all = have !== null && have >= topic.examples.length

  async function add() {
    setBusy(true)
    try {
      const n = await addExampleCards(repo, topic)
      setHave(topic.examples.length)
      setMsg(n ? `Добавлено карточек: ${n}` : 'Все примеры уже в повторении')
    } catch (e) {
      setMsg(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-secondary" disabled={busy || all || have === null} onClick={() => void add()}>
        {all ? '✓ Примеры в повторении' : '＋ Добавить примеры в повторение'}
      </button>
      {msg && <span className="text-sm text-stone-500">{msg}</span>}
    </div>
  )
}

export function ExamplesSection({ topic }: { topic: Topic }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {topic.examples.map((ex, i) => (
          <li key={i} className="card flex items-start gap-3 py-3">
            <SpeakButton text={ex.pt} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-medium" lang="pt-PT">
                {ex.pt}
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">{ex.ru}</p>
            </div>
          </li>
        ))}
      </ul>
      <AddExamplesButton topic={topic} />
    </div>
  )
}
