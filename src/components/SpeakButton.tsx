import { Snail, Square, Volume2, VolumeX } from 'lucide-react'
import type { VoiceGender } from '@/engine/audio'
import { useSpeak } from '@/features/exercises/useSpeak'
import { cx } from './cx'

export interface SpeakButtonProps {
  text: string
  /** Visible label («Слушать»); icon-only when omitted. */
  label?: string
  /** Accessible name for the icon-only button (default «Прослушать»). */
  ariaLabel?: string
  /** Multiplies the settings playback rate, e.g. 0.75 for «Медленно» (shows the snail icon). */
  rateFactor?: number
  /** Overrides the settings voice (speech-synthesis fallback only). */
  voice?: VoiceGender
  size?: 'sm' | 'md' | 'lg'
  /** solid = brand fill (primary audio action), soft = tinted (default), ghost = outline only. */
  variant?: 'solid' | 'soft' | 'ghost'
  /** Show «нет голоса pt-PT» under the button when no audio source exists. Default true for labelled buttons. */
  showUnavailable?: boolean
  className?: string
}

const DIM = {
  sm: { icon: 'size-10 hit', label: 'min-h-10 hit px-3 text-sm', glyph: 'size-[18px]' },
  md: { icon: 'size-11', label: 'min-h-11 px-4 text-sm', glyph: 'size-5' },
  lg: { icon: 'size-13', label: 'min-h-13 px-5 text-base', glyph: 'size-6' },
} as const

const VARIANT = {
  solid: 'bg-azulejo text-surface shadow-card hover:brightness-110',
  soft: 'bg-azulejo-soft text-azulejo-ink ring-1 ring-inset ring-azulejo/20 hover:ring-azulejo/45',
  ghost: 'text-azulejo-ink ring-1 ring-inset ring-line-strong hover:bg-azulejo-soft',
} as const

/**
 * The one play/stop button for pt-PT audio (mp3 or Web Speech fallback) — states idle / playing / unavailable.
 * Audio actions are azulejo blue across the app.
 */
export function SpeakButton({
  text,
  label,
  ariaLabel,
  rateFactor = 1,
  voice,
  size = 'md',
  variant = 'soft',
  showUnavailable,
  className,
}: SpeakButtonProps) {
  const { speak, stop, speaking, unavailable } = useSpeak()
  const playing = speaking !== null
  const slow = rateFactor < 1
  const Glyph = playing ? Square : unavailable ? VolumeX : slow ? Snail : Volume2
  const name = playing ? 'Остановить' : (ariaLabel ?? (label ? undefined : slow ? 'Прослушать медленно' : 'Прослушать'))
  const dim = DIM[size]
  return (
    <span className={cx('inline-flex shrink-0 flex-col items-start gap-1', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (playing) stop()
          else void speak(text, rateFactor, voice)
        }}
        aria-label={name}
        aria-pressed={label ? undefined : playing}
        title={unavailable ? 'Нет голоса pt-PT на этом устройстве' : (name ?? label)}
        className={cx(
          'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,filter,transform] duration-150 active:scale-95',
          label ? dim.label : dim.icon,
          VARIANT[variant],
          playing && 'ring-2 ring-azulejo',
        )}
      >
        <Glyph aria-hidden className={cx(dim.glyph, playing && 'fill-current')} strokeWidth={2} />
        {label && <span>{playing ? 'Стоп' : label}</span>}
      </button>
      {unavailable && (showUnavailable ?? !!label) && <span className="text-xs text-warning">нет голоса pt-PT</span>}
    </span>
  )
}
