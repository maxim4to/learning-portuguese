/**
 * speak(text): plays the pre-generated mp3 (<BASE_URL>audio/<sha1>.mp3) if present,
 * otherwise falls back to the Web Speech API with a European Portuguese voice.
 * A pt-BR voice is never used: if no pt-PT voice exists, nothing is spoken
 * and the promise resolves with `{ source: 'none' }`.
 */
import { audioHash } from './audioHash.ts'

export { audioHash, audioKey } from './audioHash.ts'

/** Browser URL of a pre-generated mp3, respecting Vite's base path (e.g. `/learning-portuguese/audio/<hash>.mp3`). */
export function audioUrl(hash: string): string {
  return `${import.meta.env.BASE_URL}audio/${hash}.mp3`
}

export type VoiceGender = 'male' | 'female'

export interface SpeakOptions {
  /** Preferred voice for the speech-synthesis fallback (mp3 files have a fixed voice). */
  voice?: VoiceGender
  /** Playback rate, 0.5–2. Default 1. */
  rate?: number
}

export type SpeakSource = 'file' | 'speech' | 'none'

export interface SpeakResult {
  source: SpeakSource
}

const existsCache = new Map<string, Promise<boolean>>()

/** HEAD-checks <BASE_URL>audio/<hash>.mp3 (cached). SPA fallbacks returning HTML count as missing. */
export function hasAudioFile(hash: string): Promise<boolean> {
  let p = existsCache.get(hash)
  if (!p) {
    p = fetch(audioUrl(hash), { method: 'HEAD' })
      .then((r) => r.ok && !(r.headers.get('content-type') ?? '').includes('text/html'))
      .catch(() => false)
    existsCache.set(hash, p)
  }
  return p
}

let current: HTMLAudioElement | null = null

/** Stops any ongoing playback (file or speech synthesis). */
export function stopSpeaking(): void {
  if (current) {
    current.pause()
    current = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<SpeakResult> {
  const rate = clampRate(opts.rate ?? 1)
  stopSpeaking()
  const hash = await audioHash(text)
  if (await hasAudioFile(hash)) {
    try {
      await playFile(audioUrl(hash), rate)
      return { source: 'file' }
    } catch {
      // fall through to speech synthesis
    }
  }
  const voice = await pickPtPtVoice(opts.voice)
  if (!voice) return { source: 'none' }
  await speakWithSynth(text, voice, rate)
  return { source: 'speech' }
}

function clampRate(r: number): number {
  return Math.min(2, Math.max(0.5, r))
}

function playFile(url: string, rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.playbackRate = rate
    audio.preservesPitch = true
    current = audio
    audio.onended = () => {
      if (current === audio) current = null
      resolve()
    }
    audio.onpause = () => resolve()
    audio.onerror = () => reject(new Error(`Failed to play ${url}`))
    audio.play().catch(reject)
  })
}

function speakWithSynth(text: string, voice: SpeechSynthesisVoice, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}

const isPtPt = (v: SpeechSynthesisVoice) => /^pt[-_]pt$/i.test(v.lang)

const FEMALE = /joana|catarina|raquel|fernanda|female|mulher|feminin/i
const MALE = /duarte|male|homem|masculin/i

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}

/** All available European Portuguese voices (never pt-BR). */
export async function getPtPtVoices(): Promise<SpeechSynthesisVoice[]> {
  return (await loadVoices()).filter(isPtPt)
}

export async function pickPtPtVoice(gender?: VoiceGender): Promise<SpeechSynthesisVoice | null> {
  const voices = await getPtPtVoices()
  if (!voices.length) return null
  if (gender) {
    const re = gender === 'female' ? FEMALE : MALE
    // MALE regex would match "female" — exclude explicitly.
    const match = voices.find((v) => re.test(v.name) && !(gender === 'male' && FEMALE.test(v.name)))
    if (match) return match
  }
  return voices.find((v) => v.localService) ?? voices[0]
}
