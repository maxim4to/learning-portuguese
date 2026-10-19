import { useEffect, useState } from 'react'
import { audioHash, hasAudioFile, pickPtPtVoice } from '@/engine/audio'

let voice: Promise<boolean> | null = null
const hasPtPtVoice = () => (voice ??= pickPtPtVoice().then((v) => !!v, () => false))

/**
 * Whether `speak(text)` can play anything: a pre-generated mp3 for exactly this text, or a pt-PT
 * speech voice on this device. `false` until checked, so the play button appears only when it works.
 */
export function useCanSpeak(text: string | undefined): boolean {
  const [state, setState] = useState<{ text?: string; ok: boolean }>({ ok: false })
  useEffect(() => {
    if (!text) return
    let alive = true
    void (async () => {
      const ok = (await hasPtPtVoice()) || (await hasAudioFile(await audioHash(text)))
      if (alive) setState({ text, ok })
    })().catch(() => {})
    return () => {
      alive = false
    }
  }, [text])
  return state.text === text && state.ok
}
