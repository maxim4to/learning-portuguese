import { useEffect, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import type { Topic } from '@/content'
import { useRepository } from '@/data'
import { SpeakButton } from '@/components/SpeakButton'
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
        {all ? <Check aria-hidden className="size-5 text-brand" /> : <Plus aria-hidden className="size-5" />}
        {all ? 'Примеры в повторении' : 'Добавить примеры в повторение'}
      </button>
      {msg && (
        <span role="status" className="text-sm text-ink-muted">
          {msg}
        </span>
      )}
    </div>
  )
}

export function ExamplesSection({ topic }: { topic: Topic }) {
  return (
    <div className="space-y-4">
      <ul className="card divide-y divide-line p-0">
        {topic.examples.map((ex, i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <SpeakButton text={ex.pt} />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-base leading-snug font-semibold" lang="pt-PT">
                {ex.pt}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">{ex.ru}</p>
            </div>
          </li>
        ))}
      </ul>
      <AddExamplesButton topic={topic} />
    </div>
  )
}
