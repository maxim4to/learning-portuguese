import { useEffect, useRef, useState } from 'react'
import { Check, Mic, Square } from 'lucide-react'
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

  if (!canRecord()) return <p className="text-sm text-ink-muted">Запись в этом браузере недоступна — повторите вслух.</p>

  return (
    <div className="space-y-2">
      {state === 'recording' ? (
        <button type="button" className="btn-danger" onClick={() => rec.current?.stop()}>
          <span className="inline-block size-2.5 animate-pulse rounded-full bg-white" aria-hidden />
          <Square aria-hidden className="size-4 fill-current" /> Остановить запись
        </button>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => void start()}>
          <Mic aria-hidden className="size-5" /> {state === 'recorded' ? 'Записать заново' : 'Записать себя'}
        </button>
      )}
      {url && state === 'recorded' && <audio controls src={url} className="w-full max-w-sm" />}
      {error && <p className="text-sm text-danger">{error}</p>}
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
        {ex.ru && <p className="text-sm text-ink-muted">{ex.ru}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SpeakButton text={ex.text} size="lg" variant="solid" label="Слушать" />
        <SpeakButton text={ex.text} rateFactor={0.75} label="Медленно" />
      </div>
      <SelfRecorder />
      {!locked && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-sm text-ink-muted">Сравните с оригиналом и оцените себя:</p>
          <div className="sticky-actions -mx-2 flex flex-wrap gap-2 rounded-pill bg-surface/95 p-2 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0">
            <button type="button" className="btn-primary" onClick={() => onSubmit({ given: 'получилось', verdict: 'correct' })}>
              <Check aria-hidden className="size-5" /> Получилось
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
