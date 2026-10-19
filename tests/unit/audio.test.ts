/**
 * engine/audioHash.ts (pure hashing) and engine/audio.ts (mp3-first playback with a pt-PT speech fallback),
 * with fetch / Audio / speechSynthesis stubbed. Each test re-imports audio.ts for a clean HEAD-check cache.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { audioHash, audioKey } from '@/engine/audioHash'

const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex')

describe('audioKey / audioHash', () => {
  test('key is trimmed NFC', () => {
    expect(audioKey('  olá \n')).toBe('olá')
    expect(audioKey('olá'.normalize('NFD'))).toBe('olá')
  })

  test('hash is sha1 hex of the key (same as scripts/tts.ts / Node crypto)', async () => {
    for (const s of ['Bom dia!', 'Olá, como estás?', 'pão', '', '😀 emoji', 'a'.repeat(10_000)]) {
      expect(await audioHash(s)).toBe(sha1(audioKey(s)))
    }
  })

  test('NFD and NFC spellings and surrounding whitespace hash identically; case and punctuation do not', async () => {
    const h = await audioHash('Está bem.')
    expect(await audioHash('  Está bem.'.normalize('NFD') + ' ')).toBe(h)
    expect(await audioHash('está bem.')).not.toBe(h)
    expect(await audioHash('Está bem')).not.toBe(h)
    expect(h).toMatch(/^[0-9a-f]{40}$/)
  })
})

// ─── audio.ts ────────────────────────────────────────────────────────────────

interface FakeVoice {
  name: string
  lang: string
  localService: boolean
}
class FakeAudio {
  static instances: FakeAudio[] = []
  static failPlay = false
  playbackRate = 1
  preservesPitch = false
  paused = true
  onended: (() => void) | null = null
  onpause: (() => void) | null = null
  onerror: (() => void) | null = null
  src: string
  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
  play() {
    if (FakeAudio.failPlay) return Promise.reject(new Error('NotAllowedError'))
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.onpause?.()
  }
  end() {
    this.paused = true
    this.onended?.()
  }
}
class FakeUtterance {
  voice: FakeVoice | null = null
  lang = ''
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  text: string
  constructor(text: string) {
    this.text = text
  }
}

let voices: FakeVoice[] = []
let spoken: FakeUtterance[] = []
let listeners: Record<string, () => void> = {}
const synth = {
  cancel: vi.fn(),
  getVoices: () => voices,
  speak: (u: FakeUtterance) => {
    spoken.push(u)
    queueMicrotask(() => u.onend?.())
  },
  addEventListener: (ev: string, fn: () => void) => {
    listeners[ev] = fn
  },
}
let fetchMock: ReturnType<typeof vi.fn>
const head = (ok: boolean, type = 'audio/mpeg') => Promise.resolve({ ok, headers: new Headers({ 'content-type': type }) })

async function load() {
  vi.resetModules()
  return import('@/engine/audio')
}

/** Waits until `n` Audio elements exist (the hash uses async WebCrypto, so a fixed number of ticks is flaky). */
const flush = (n = 1) => vi.waitFor(() => expect(FakeAudio.instances.length).toBeGreaterThanOrEqual(n), { timeout: 2000, interval: 1 })

beforeEach(() => {
  FakeAudio.instances = []
  FakeAudio.failPlay = false
  voices = []
  spoken = []
  listeners = {}
  synth.cancel.mockClear()
  fetchMock = vi.fn(() => head(true))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('audioUrl / hasAudioFile', () => {
  test('url respects BASE_URL', async () => {
    const { audioUrl } = await load()
    expect(audioUrl('abc')).toBe(`${import.meta.env.BASE_URL}audio/abc.mp3`)
  })

  test('HEAD ok with audio type → true; cached per hash (one request)', async () => {
    const { hasAudioFile } = await load()
    expect(await hasAudioFile('h1')).toBe(true)
    expect(await hasAudioFile('h1')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'HEAD' })
  })

  test('SPA fallback (200 text/html) counts as missing; 404 too; network error too', async () => {
    const { hasAudioFile } = await load()
    fetchMock.mockImplementationOnce(() => head(true, 'text/html; charset=utf-8'))
    expect(await hasAudioFile('spa')).toBe(false)
    fetchMock.mockImplementationOnce(() => head(false))
    expect(await hasAudioFile('404')).toBe(false)
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    expect(await hasAudioFile('net')).toBe(false)
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, headers: new Headers() }))
    expect(await hasAudioFile('notype')).toBe(true)
  })

  // A-01 (fixed): a transient network failure is not cached as «no file» for the whole session.
  test('a failed HEAD (offline) is retried later instead of being cached as «missing» [BUG A-01]', async () => {
    const { hasAudioFile } = await load()
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    expect(await hasAudioFile('h')).toBe(false)
    expect(await hasAudioFile('h')).toBe(true) // back online
  })
})

describe('speak', () => {
  test('plays the mp3 when present, with the clamped rate and preserved pitch', async () => {
    const { speak } = await load()
    const p = speak('Olá', { rate: 5 })
    await flush()
    const a = FakeAudio.instances[0]
    expect(a.src).toMatch(new RegExp(`audio/${sha1('Olá')}\\.mp3$`))
    expect(a.playbackRate).toBe(2)
    expect(a.preservesPitch).toBe(true)
    a.end()
    expect(await p).toEqual({ source: 'file' })
  })

  test('rate is clamped from below too', async () => {
    const { speak } = await load()
    const p = speak('x', { rate: 0.1 })
    await flush()
    expect(FakeAudio.instances[0].playbackRate).toBe(0.5)
    FakeAudio.instances[0].end()
    await p
  })

  test('no mp3 → speech synthesis with a pt-PT voice; never pt-BR', async () => {
    fetchMock.mockImplementation(() => head(false))
    voices = [
      { name: 'Luciana', lang: 'pt-BR', localService: true },
      { name: 'Joana', lang: 'pt-PT', localService: false },
    ]
    const { speak } = await load()
    expect(await speak('Bom dia', { rate: 0.8 })).toEqual({ source: 'speech' })
    expect(spoken).toHaveLength(1)
    expect(spoken[0]).toMatchObject({ text: 'Bom dia', lang: 'pt-PT', rate: 0.8 })
    expect(spoken[0].voice?.name).toBe('Joana')
  })

  test('only pt-BR voices → nothing is spoken', async () => {
    fetchMock.mockImplementation(() => head(false))
    voices = [{ name: 'Luciana', lang: 'pt-BR', localService: true }]
    const { speak } = await load()
    expect(await speak('Bom dia')).toEqual({ source: 'none' })
    expect(spoken).toHaveLength(0)
  })

  test('mp3 fails to play (autoplay blocked) → falls back to speech', async () => {
    FakeAudio.failPlay = true
    voices = [{ name: 'Joana', lang: 'pt_PT', localService: true }]
    const { speak } = await load()
    expect(await speak('Olá')).toEqual({ source: 'speech' })
  })

  test('mp3 decode error → falls back to speech', async () => {
    voices = [{ name: 'Joana', lang: 'pt-PT', localService: true }]
    const { speak } = await load()
    const p = speak('Olá')
    await flush()
    FakeAudio.instances[0].onerror?.()
    expect(await p).toEqual({ source: 'speech' })
  })

  test('stopSpeaking pauses the current file (speak resolves) and cancels synthesis', async () => {
    const { speak, stopSpeaking } = await load()
    const p = speak('Olá')
    await flush()
    stopSpeaking()
    expect(FakeAudio.instances[0].paused).toBe(true)
    expect(synth.cancel).toHaveBeenCalled()
    expect(await p).toEqual({ source: 'file' })
  })

  test('stopSpeaking without speechSynthesis (old browser) does not throw', async () => {
    vi.stubGlobal('speechSynthesis', undefined)
    const { stopSpeaking, getPtPtVoices } = await load()
    expect(() => stopSpeaking()).not.toThrow()
    expect(await getPtPtVoices()).toEqual([])
  })

  // A-02 (fixed): two quick taps on different «play» buttons — only the latest one plays.
  test('a second speak() while the first is still resolving stops the first [BUG A-02]', async () => {
    const { speak } = await load()
    const first = speak('primeiro')
    void speak('segundo')
    await flush(1)
    expect(await first).toEqual({ source: 'none' })
    const playing = FakeAudio.instances.filter((a) => !a.paused)
    expect(playing).toHaveLength(1)
    expect(playing[0].src).toMatch(new RegExp(`audio/${sha1('segundo')}\\.mp3$`))
    expect(FakeAudio.instances.some((a) => a.src.includes(sha1('primeiro')) && !a.paused)).toBe(false)
  })

  test('a new speak() after the first started playing pauses the first', async () => {
    const { speak } = await load()
    void speak('primeiro')
    await flush(1)
    void speak('segundo')
    await flush(2)
    expect(FakeAudio.instances[0].paused).toBe(true)
    expect(FakeAudio.instances[1].paused).toBe(false)
  })
})

describe('voices', () => {
  test('waits for voiceschanged when the list is empty at first', async () => {
    const { getPtPtVoices } = await load()
    const p = getPtPtVoices()
    voices = [{ name: 'Joana', lang: 'pt-PT', localService: true }]
    listeners.voiceschanged()
    expect((await p).map((v) => v.name)).toEqual(['Joana'])
  })

  test('gives up after 1.5 s without voiceschanged', async () => {
    vi.useFakeTimers()
    const { getPtPtVoices } = await load()
    const p = getPtPtVoices()
    await vi.advanceTimersByTimeAsync(1500)
    expect(await p).toEqual([])
  })

  test.each([
    ['female', 'Joana'],
    ['male', 'Duarte'],
    [undefined, 'Local'],
  ] as const)('gender %s → %s', async (gender, name) => {
    voices = [
      { name: 'Remote', lang: 'pt-PT', localService: false },
      { name: 'Google português female', lang: 'pt-BR', localService: true },
      { name: 'Joana', lang: 'pt-PT', localService: false },
      { name: 'Duarte', lang: 'PT-pt', localService: false },
      { name: 'Local', lang: 'pt-PT', localService: true },
    ]
    const { pickPtPtVoice } = await load()
    expect((await pickPtPtVoice(gender))?.name).toBe(name)
  })

  test('male never picks a voice named «female»', async () => {
    voices = [
      { name: 'Microsoft Female', lang: 'pt-PT', localService: false },
      { name: 'Other', lang: 'pt-PT', localService: true },
    ]
    const { pickPtPtVoice } = await load()
    expect((await pickPtPtVoice('male'))?.name).toBe('Other')
  })

  test('no gender match → local voice, else the first', async () => {
    voices = [
      { name: 'A', lang: 'pt-PT', localService: false },
      { name: 'B', lang: 'pt-PT', localService: false },
    ]
    const { pickPtPtVoice } = await load()
    expect((await pickPtPtVoice('female'))?.name).toBe('A')
  })

  test('no voices at all → null', async () => {
    const { pickPtPtVoice } = await load()
    vi.useFakeTimers()
    const p = pickPtPtVoice()
    await vi.advanceTimersByTimeAsync(1500)
    expect(await p).toBeNull()
  })
})
