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
  /** Same heights as Button: sm 36px (44px hit), md 44px. */
  size?: 'sm' | 'md'
  /** solid = brand fill (primary audio action), soft = tinted (default), ghost = outline only. */
  variant?: 'solid' | 'soft' | 'ghost'
  /** Show «нет голоса pt-PT» under the button when no audio source exists. Default true for labelled buttons. */
  showUnavailable?: boolean
  className?: string
}

const DIM = {
  sm: { icon: 'size-9 hit', label: 'h-9 hit px-4 text-sm', glyph: 'size-4' },
  md: { icon: 'size-11', label: 'h-11 px-5 text-base', glyph: 'size-[1.125rem]' },
} as const

const VARIANT = {
  solid: 'bg-ink text-surface hover:bg-brand hover:text-on-brand',
  soft: 'bg-azulejo-soft text-ink hover:bg-sunken',
  ghost: 'text-ink ring-[1.5px] ring-inset ring-line-strong hover:ring-ink',
} as const

/**
 * The one play/stop button for pt-PT audio (mp3 or Web Speech fallback) — states idle / playing / unavailable.
 * Audio actions are monochrome ink across the app; playback lights them Ember.
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
          playing && 'bg-brand text-on-brand ring-2 ring-brand ring-offset-2 ring-offset-surface',
        )}
      >
        <Glyph aria-hidden className={cx(dim.glyph, playing && 'fill-current')} strokeWidth={2} />
        {label && <span>{playing ? 'Стоп' : label}</span>}
      </button>
      {unavailable && (showUnavailable ?? !!label) && <span className="text-xs text-warning">нет голоса pt-PT</span>}
    </span>
  )
}
