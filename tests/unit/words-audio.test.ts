/**
 * src/features/words/audio.ts — what a word's listening card plays (pt-PT voice / mp3 of the display form / mp3 of the
 * lemma) and the hooks around it. `@/engine/audio` is mocked; hooks run on the fake hook runtime.
 * The module memoises the voice check, so every test imports a fresh copy (vi.resetModules).
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'

const audio = vi.hoisted(() => ({
  voice: false as boolean | 'reject',
  files: new Set<string>(),
  voiceCalls: 0,
  hashFails: false,
}))

vi.mock('react', async (orig) => ({ ...(await orig<object>()), ...(await import('../helpers/A-words-env.ts')).fakeReact }))
vi.mock('@/engine/audio', () => ({
  audioHash: async (t: string) => {
    if (audio.hashFails) throw new Error('no subtle crypto')
    return `h(${t})`
  },
  hasAudioFile: async (h: string) => audio.files.has(h),
  pickPtPtVoice: async () => {
    audio.voiceCalls++
    if (audio.voice === 'reject') throw new Error('speech blocked')
    return audio.voice ? ({ name: 'Joana', lang: 'pt-PT' } as unknown as SpeechSynthesisVoice) : null
  },
}))

async function fresh() {
  vi.resetModules()
  const env = await import('../helpers/A-words-env.ts')
  const mod = await import('@/features/words/audio')
  return { ...env, ...mod }
}

beforeEach(() => {
  audio.voice = false
  audio.files = new Set()
  audio.voiceCalls = 0
  audio.hashFails = false
})

const saude = { lemma: 'saúde', pos: 'noun' as const, gender: 'f' as const }

describe('listenText', () => {
  test('a pt-PT voice speaks the display form (with article)', async () => {
    audio.voice = true
    const { listenText } = await fresh()
    expect(await listenText(saude)).toBe('a saúde')
  })

  test('no voice: mp3 of the display form first, then of the bare lemma', async () => {
    const { listenText } = await fresh()
    audio.files = new Set(['h(a saúde)', 'h(saúde)'])
    expect(await listenText(saude)).toBe('a saúde')
    audio.files = new Set(['h(saúde)'])
    expect(await listenText(saude)).toBe('saúde')
  })

  test('no voice, no files → null; non-nouns try the lemma once', async () => {
    const { listenText } = await fresh()
    expect(await listenText(saude)).toBeNull()
    audio.files = new Set(['h(levantar-se)'])
    expect(await listenText({ lemma: 'levantar-se', pos: 'verb' })).toBe('levantar-se')
  })

  test('a rejected voice lookup counts as «no voice» and is checked only once', async () => {
    audio.voice = 'reject'
    const { listenText } = await fresh()
    audio.files = new Set(['h(saúde)'])
    expect(await listenText(saude)).toBe('saúde')
    expect(await listenText(saude)).toBe('saúde')
    expect(audio.voiceCalls).toBe(1)
  })
})

describe('useCanSpeak', () => {
  test('false until checked, then true with a voice', async () => {
    audio.voice = true
    const { useCanSpeak, renderHook, flush } = await fresh()
    const h = renderHook(() => useCanSpeak('olá'))
    expect(h.result).toBe(false)
    await flush()
    expect(h.result).toBe(true)
  })

  test('mp3 of exactly this text, else false; undefined text → false without checking', async () => {
    const { useCanSpeak, renderHook, flush } = await fresh()
    audio.files = new Set(['h(olá)'])
    const h = renderHook<boolean, string | undefined>((t) => useCanSpeak(t), 'olá')
    await flush()
    expect(h.result).toBe(true)
    // another text: the old answer is not reused while the new one is checked
    h.rerender('adeus')
    expect(h.result).toBe(false)
    await flush()
    expect(h.result).toBe(false)
    h.rerender(undefined)
    expect(h.result).toBe(false)
  })

  test('errors are swallowed (hash failure → stays false)', async () => {
    audio.hashFails = true
    const { useCanSpeak, renderHook, flush } = await fresh()
    const h = renderHook(() => useCanSpeak('olá'))
    await flush()
    expect(h.result).toBe(false)
  })

  test('unmounted before the check finishes: no update', async () => {
    audio.voice = true
    const { useCanSpeak, renderHook, flush } = await fresh()
    const h = renderHook(() => useCanSpeak('olá'))
    h.unmount()
    const n = h.renders
    await flush()
    expect(h.renders).toBe(n)
  })
})

describe('useListenText', () => {
  test('undefined while checking, then the text', async () => {
    audio.files = new Set(['h(saúde)'])
    const { useListenText, renderHook, flush } = await fresh()
    const h = renderHook(() => useListenText(saude))
    expect(h.result).toBeUndefined()
    await flush()
    expect(h.result).toBe('saúde')
  })

  test('null when nothing can be played; undefined entry → undefined', async () => {
    const { useListenText, renderHook, flush } = await fresh()
    const h = renderHook<string | null | undefined, typeof saude | undefined>((e) => useListenText(e), saude)
    await flush()
    expect(h.result).toBeNull()
    h.rerender(undefined)
    expect(h.result).toBeUndefined()
  })

  test('a failing check resolves to null', async () => {
    audio.hashFails = true
    const { useListenText, renderHook, flush } = await fresh()
    const h = renderHook(() => useListenText(saude))
    await flush()
    expect(h.result).toBeNull()
  })

  test('a changed gender (new display form) re-checks; unmount stops updates', async () => {
    audio.files = new Set(['h(o saúde)'])
    const { useListenText, renderHook, flush } = await fresh()
    type E = { lemma: string; pos: 'noun'; gender: 'm' | 'f' }
    const h = renderHook<string | null | undefined, E>((e) => useListenText(e), saude)
    await flush()
    expect(h.result).toBeNull()
    h.rerender({ lemma: 'saúde', pos: 'noun', gender: 'm' })
    expect(h.result).toBeUndefined()
    await flush()
    expect(h.result).toBe('o saúde')
    h.rerender(saude)
    h.unmount()
    const n = h.renders
    await flush()
    expect(h.renders).toBe(n)
  })
})
