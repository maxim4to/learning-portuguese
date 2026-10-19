import type { VoiceGender } from '@/engine/audio'
import { SpeakButton as Shared } from '@/components/SpeakButton'

/**
 * Compatibility wrapper over the shared SpeakButton for SRS cards: `label` is the accessible name (icon-only),
 * `rate` is ignored — the shared button already uses the settings rate.
 */
export function SpeakButton({
  text,
  voice,
  className,
  label = 'Прослушать',
  size = 'md',
}: {
  text: string
  voice?: VoiceGender
  rate?: number
  className?: string
  label?: string
  size?: 'sm' | 'md'
}) {
  return <Shared text={text} voice={voice} ariaLabel={label} size={size} className={className} />
}
