import { useCallback, useEffect, useRef, useState } from 'react'
import { speak as engineSpeak, stopSpeaking, type SpeakSource, type VoiceGender } from '@/engine/audio'
import { useSettings } from './useSettings'

export interface UseSpeak {
  /** Plays `text` with the user's voice/rate. `rateFactor` multiplies the settings rate (e.g. 0.75 for "slower");
   *  `voice` overrides the settings voice (e.g. dialogue speakers). */
  speak(text: string, rateFactor?: number, voice?: VoiceGender): Promise<SpeakSource>
  stop(): void
  /** Text currently being spoken by this hook instance (null when idle). */
  speaking: string | null
  /** true after a speak() found neither an mp3 nor a pt-PT voice. */
  unavailable: boolean
}

/** Thin wrapper over engine/audio `speak` / `stopSpeaking` using settings.voice / settings.rate. */
export function useSpeak(): UseSpeak {
  const { voice, rate } = useSettings()
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const token = useRef(0)
  const active = useRef(false)

  const speak = useCallback(
    async (text: string, rateFactor = 1, voiceOverride?: VoiceGender) => {
      const my = ++token.current
      setSpeaking(text)
      active.current = true
      try {
        const r = await engineSpeak(text, { voice: voiceOverride ?? voice, rate: rate * rateFactor })
        if (my === token.current) setUnavailable(r.source === 'none')
        return r.source
      } catch {
        return 'none' as const
      } finally {
        if (my === token.current) {
          setSpeaking(null)
          active.current = false
        }
      }
    },
    [voice, rate],
  )

  const stop = useCallback(() => {
    token.current++
    active.current = false
    setSpeaking(null)
    stopSpeaking()
  }, [])

  // Stop playback started by this instance on unmount.
  useEffect(
    () => () => {
      if (active.current) stopSpeaking()
    },
    [],
  )

  return { speak, stop, speaking, unavailable }
}
