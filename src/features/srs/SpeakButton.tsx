import { useState } from 'react'
import { speak, type VoiceGender } from '@/engine/audio'

interface Props {
  text: string
  voice?: VoiceGender
  rate?: number
  className?: string
  label?: string
  size?: 'sm' | 'md'
}

/** Small round play button that speaks pt-PT text (mp3 or speech fallback). */
export function SpeakButton({ text, voice, rate, className = '', label = 'Прослушать', size = 'md' }: Props) {
  const [state, setState] = useState<'idle' | 'playing' | 'none'>('idle')
  return (
    <button
      type="button"
      aria-label={label}
      title={state === 'none' ? 'Нет голоса pt-PT на этом устройстве' : label}
      onClick={(e) => {
        e.stopPropagation()
        setState('playing')
        speak(text, { voice, rate })
          .then((r) => setState(r.source === 'none' ? 'none' : 'idle'))
          .catch(() => setState('idle'))
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white ${size === 'sm' ? 'size-8 text-sm' : 'size-10 text-lg'} hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800 ${
        state === 'playing' ? 'animate-pulse border-brand-500' : ''
      } ${className}`}
    >
      <span aria-hidden>{state === 'none' ? '🔇' : '🔊'}</span>
    </button>
  )
}
