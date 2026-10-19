import type { VoiceGender } from '@/engine/audio'
import { useSpeak } from './useSpeak'

interface SpeakButtonProps {
  text: string
  /** Visible label; icon-only (with aria-label) when omitted. */
  label?: string
  /** Multiplies the settings playback rate, e.g. 0.75 for a "slower" button. */
  rateFactor?: number
  /** Overrides the settings voice (speech-synthesis fallback only). */
  voice?: VoiceGender
  size?: 'sm' | 'lg'
  className?: string
}

/** Round play/stop button that speaks pt-PT text (mp3 or Web Speech fallback). */
export function SpeakButton({ text, label, rateFactor = 1, voice, size = 'sm', className = '' }: SpeakButtonProps) {
  const { speak, stop, speaking, unavailable } = useSpeak()
  const playing = speaking !== null
  const dim = size === 'lg' ? 'h-14 min-w-14 text-2xl' : 'h-10 min-w-10 text-lg'
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => (playing ? stop() : void speak(text, rateFactor, voice))}
        aria-label={label ?? (playing ? 'Остановить' : 'Прослушать')}
        title={playing ? 'Остановить' : 'Прослушать'}
        className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-brand-600/30 bg-brand-50 px-3 font-medium text-brand-800 transition hover:bg-brand-100 active:scale-95 dark:border-brand-500/30 dark:hover:bg-brand-800/60 dark:bg-brand-800/30 dark:text-brand-100 ${dim}`}
      >
        <span aria-hidden>{playing ? '■' : rateFactor < 1 ? '🐢' : '▶'}</span>
        {label && <span className="text-sm">{label}</span>}
      </button>
      {unavailable && <span className="text-xs text-amber-700 dark:text-amber-400">нет голоса pt-PT</span>}
    </span>
  )
}
