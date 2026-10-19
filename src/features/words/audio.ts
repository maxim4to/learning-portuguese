import { useEffect, useState } from 'react'
import { audioHash, hasAudioFile, pickPtPtVoice } from '@/engine/audio'
import type { WordEntry } from '@/data'
import { wordPt } from './wordOps.ts'

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

/**
 * Text to play for a word's listening card: its display form («a saúde») when a pt-PT voice exists or an mp3 was
 * generated for it, else the bare lemma's mp3; null when nothing can be played on this device.
 */
export async function listenText(entry: Pick<WordEntry, 'lemma' | 'pos' | 'gender'>): Promise<string | null> {
  const pt = wordPt(entry)
  if (await hasPtPtVoice()) return pt
  for (const t of pt === entry.lemma ? [pt] : [pt, entry.lemma]) if (await hasAudioFile(await audioHash(t))) return t
  return null
}

/** `listenText` as a hook: undefined while checking, then the text or null. */
export function useListenText(entry: Pick<WordEntry, 'lemma' | 'pos' | 'gender'> | undefined): string | null | undefined {
  const key = entry ? wordPt(entry) + '\u0000' + entry.lemma : undefined
  const [state, setState] = useState<{ key?: string; text: string | null }>({ text: null })
  useEffect(() => {
    if (!entry || !key) return
    let alive = true
    listenText(entry)
      .catch(() => null)
      .then((text) => alive && setState({ key, text }))
    return () => {
      alive = false
    }
    // `key` covers the fields listenText reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.key === key ? state.text : undefined
}
