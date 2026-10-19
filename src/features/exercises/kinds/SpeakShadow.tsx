import { useEffect, useRef, useState } from 'react'
import { SpeakButton } from '../SpeakButton'
import type { ExerciseProps } from '../types'

type RecState = 'idle' | 'recording' | 'recorded' | 'error'

const canRecord = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Record yourself with MediaRecorder and play it back. */
function SelfRecorder() {
  const [state, setState] = useState<RecState>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)

  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(
    () => () => {
      if (rec.current?.state === 'recording') rec.current.stop()
      release()
    },
    [],
  )
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  async function start() {
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = s
      const r = new MediaRecorder(s)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        release()
        setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })))
        setState('recorded')
      }
      rec.current = r
      r.start()
      setState('recording')
    } catch (e) {
      release()
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Нет доступа к микрофону' : 'Не удалось начать запись')
      setState('error')
    }
  }

  if (!canRecord()) return <p className="text-sm text-stone-500">Запись в этом браузере недоступна — повторите вслух.</p>

  return (
    <div className="space-y-2">
      {state === 'recording' ? (
        <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => rec.current?.stop()}>
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-white" aria-hidden /> Остановить запись
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => void start()}>
          🎙 {state === 'recorded' ? 'Записать заново' : 'Записать себя'}
        </button>
      )}
      {url && state === 'recorded' && <audio controls src={url} className="w-full max-w-sm" />}
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function SpeakShadowExercise({ exercise: ex, locked, onSubmit }: ExerciseProps<'speak-shadow'>) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xl leading-relaxed" lang="pt-PT">
          {ex.text}
        </p>
        {ex.ru && <p className="text-sm text-stone-500 dark:text-stone-400">{ex.ru}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SpeakButton text={ex.text} size="lg" label="Слушать" />
        <SpeakButton text={ex.text} rateFactor={0.75} label="Медленно" />
      </div>
      <SelfRecorder />
      {!locked && (
        <div className="space-y-2 border-t border-stone-200 pt-3 dark:border-stone-800">
          <p className="text-sm text-stone-500">Сравните с оригиналом и оцените себя:</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => onSubmit({ given: 'получилось', verdict: 'correct' })}>
              Получилось ✓
            </button>
            <button type="button" className="btn-secondary" onClick={() => onSubmit({ given: 'ещё раз', verdict: 'wrong' })}>
              Ещё потренироваться
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
