/**
 * src/features/words/useWords.ts — WordsStore over a real local DataStore (LocalBackend + in-memory localStorage):
 * snapshot derivation and caching, every action incl. undo, staged unlock after ratings, the daily new-card counter,
 * settings modes, legacy cleanup; the hooks on the fake hook runtime.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/** listenText result: the text (playable), null (nothing to play) or 'reject' (the check throws). */
const audio = vi.hoisted(() => ({ voice: true as boolean | 'reject' }))

vi.mock('react', async (orig) => ({ ...(await orig<object>()), ...(await import('../helpers/A-words-env.ts')).fakeReact }))
vi.mock('@/features/words/audio', () => ({
  listenText: async (e: { lemma: string }) => {
    if (audio.voice === 'reject') throw new Error('blocked')
    return audio.voice ? e.lemma : null
  },
}))

const { MemoryStorage, provideContext, renderHook } = await import('../helpers/A-words-env.ts')
const { DataStore } = await import('@/data/store')
const { LocalBackend } = await import('@/data/localBackend')
const { applyEntries, card, fsrs, fsrsNew, localEntries, NOW, DAY, word, wordCard } = await import('../fixtures/seed.ts')
const words = await import('@/features/words/useWords')
const { WordsStore, WordsContext } = words
const { newSeenToday } = await import('@/features/srs/newCardCounter')

type Seed = Parameters<typeof localEntries>[0]

function makeStore(seed: Seed = {}, attach = true) {
  applyEntries(localStorage, localEntries(seed))
  const repo = new DataStore({ kind: 'local' })
  if (attach) repo.attach(new LocalBackend())
  return { repo, store: new WordsStore(repo) }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  audio.voice = true
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  provideContext(WordsContext, undefined)
})

describe('snapshot', () => {
  test('loading before the backend is attached, ready after', () => {
    const { repo, store } = makeStore({}, false)
    expect(store.getSnapshot().status).toBe('loading')
    repo.attach(new LocalBackend())
    expect(store.getSnapshot().status).toBe('ready')
  })

  test('derived index: newest first, lexId map, homographs by lemma, dictionary cards only, counts', () => {
    const a = word('casa', 'дом', { lexId: 'casa#noun', createdAt: NOW - 3 * DAY })
    const b = word('casa', 'жениться?', { id: 'casa#verb', lexId: 'casa#verb', createdAt: NOW - DAY })
    const c = word('Pão', 'хлеб', { id: 'u:pão', createdAt: NOW - 2 * DAY, mark: 'known' })
    const { store } = makeStore({
      words: [a, b, c],
      cards: [wordCard(a, 'recognize', { fsrs: fsrsNew() }), wordCard(b, 'recognize'), card('ph:x:1', { kind: 'phrase' })],
    })
    const s = store.getSnapshot()
    expect(s.status).toBe('ready')
    expect(s.error).toBeNull()
    expect(s.words.map((w) => w.id)).toEqual(['casa#verb', 'u:pão', 'casa#noun'])
    expect(s.cards.every((x) => x.wordId)).toBe(true)
    expect(s.index.byLexId.get('casa#noun')).toEqual(a)
    expect(s.index.byLemma.get('casa')!.map((w) => w.id).sort()).toEqual(['casa#noun', 'casa#verb'])
    expect(s.index.byLemma.get('pão')!.map((w) => w.id)).toEqual(['u:pão'])
    expect(s.statuses.get('casa#noun')).toBe('new')
    expect(s.statuses.get('casa#verb')).toBe('learning')
    expect(s.statuses.get('u:pão')).toBe('known')
    expect(s.counts).toEqual({ new: 1, learning: 1, known: 1, paused: 0, total: 3 })
  })

  test('the snapshot object is stable until the data changes', async () => {
    const { store } = makeStore()
    const s1 = store.getSnapshot()
    expect(store.getSnapshot()).toBe(s1)
    await store.actions.saveWord({ lemma: 'olá', ru: 'привет' })
    const s2 = store.getSnapshot()
    expect(s2).not.toBe(s1)
    expect(s2.words.map((w) => w.lemma)).toEqual(['olá'])
  })

  test('subscribe forwards DataStore notifications', async () => {
    const { store } = makeStore()
    const cb = vi.fn()
    const off = store.subscribe(cb)
    await store.actions.saveWord({ lemma: 'olá', ru: 'привет' })
    expect(cb).toHaveBeenCalled()
    off()
    cb.mockClear()
    await store.actions.saveWord({ lemma: 'adeus', ru: 'пока' })
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('actions', () => {
  test('saveWord creates the entry and its recognize card; undo removes both', async () => {
    const { store, repo } = makeStore()
    const r = await store.actions.saveWord({ lexId: 'saúde#noun', lemma: 'saúde', ru: 'здоровье', pos: 'noun', gender: 'f', source: { src: 'vocab:saude', form: 'saúde' } })
    expect(r.words.map((w) => w.id)).toEqual(['saúde#noun'])
    expect(repo.cardList().map((c) => c.id)).toEqual(['lex:saúde#noun:recognize'])
    expect(JSON.parse(localStorage.getItem('ptpt:v1:words')!)['saúde#noun'].sources[0].at).toBe(NOW)
    await r.undo()
    expect(repo.wordList()).toEqual([])
    expect(repo.cardList()).toEqual([])
  })

  test('settings without recognize: saved without a card', async () => {
    const { store, repo } = makeStore({ settings: { wordModes: ['produce'] } })
    await store.actions.saveWords([{ lemma: 'x', ru: 'y' }])
    expect(repo.wordList()).toHaveLength(1)
    expect(repo.cardList()).toEqual([])
  })

  test('update / addSource / markKnown / unmarkKnown / delete with undo', async () => {
    const w = word('casa', 'дом', { modes: ['recognize', 'produce', 'cloze', 'listen'] })
    const { store, repo } = makeStore({ words: [w], cards: [wordCard(w)] })
    const up = await store.actions.updateWord(w.id, { ru: 'дом; жилище' })
    expect(repo.wordList()[0].ru).toBe('дом; жилище')
    await up.undo()
    expect(repo.wordList()[0].ru).toBe('дом')

    await store.actions.addSource(w.id, { src: 'reading:r:paragraph:1', form: 'casa', sentence: 'A casa é azul.', at: NOW })
    expect(repo.wordList()[0].sources).toHaveLength(2)

    await store.actions.markKnown(w.id)
    expect(store.getSnapshot().statuses.get(w.id)).toBe('known')
    expect(repo.cardList()[0].suspended).toBe(true)
    await store.actions.unmarkKnown(w.id)
    expect(store.getSnapshot().statuses.get(w.id)).toBe('learning')
    expect(repo.cardList()[0].suspended).toBeUndefined()

    const del = await store.actions.deleteWords([w.id])
    expect(repo.wordList()).toEqual([])
    expect(repo.cardList()).toEqual([])
    await del.undo()
    expect(repo.wordList().map((x) => x.id)).toEqual([w.id])
    expect(repo.cardList().map((x) => x.id)).toEqual([wordCard(w).id])
  })

  test('an empty plan writes nothing and its undo is a no-op', async () => {
    const { store, repo } = makeStore()
    const spy = vi.spyOn(repo, 'saveWordBundle')
    const r = await store.actions.updateWord('u:missing', { ru: 'x' })
    expect(r.words).toEqual([])
    await r.undo()
    expect(spy).not.toHaveBeenCalled()
    store.actions.onCardsUpdated([])
    await store.actions.reload()
  })

  test('a failed commit rejects the action (DataStore rolls back)', async () => {
    const { store, repo } = makeStore()
    vi.spyOn(repo, 'saveWordBundle').mockRejectedValueOnce(new Error('quota'))
    await expect(store.actions.saveWord({ lemma: 'x', ru: 'y' })).rejects.toThrow('quota')
  })
})

describe('reviews and unlocks', () => {
  const learningRecognize = () => {
    const w = word('casa', 'дом', { modes: ['recognize', 'produce', 'cloze', 'listen'] })
    return { w, rec: wordCard(w, 'recognize', { fsrs: fsrsNew() }) }
  }

  test('onCardReviewed: Good on recognize creates produce; non-dictionary and other modes do nothing', async () => {
    const { w, rec } = learningRecognize()
    const { store, repo } = makeStore({ words: [w], cards: [rec] })
    await store.actions.onCardReviewed(card('ph:x:1'), 'good')
    await store.actions.onCardReviewed(wordCard(w, 'produce'), 'good')
    expect(repo.cardList().map((c) => c.mode)).toEqual(['recognize'])
    await store.actions.onCardReviewed(rec, 'good')
    expect(repo.cardList().map((c) => c.mode).sort()).toEqual(['produce', 'recognize'])
  })

  test('onCardReviewed for a word that is no longer saved does nothing', async () => {
    const { w, rec } = learningRecognize()
    const { store, repo } = makeStore({ cards: [rec] })
    await store.actions.onCardReviewed(rec, 'good')
    expect(repo.cardList()).toHaveLength(1)
    void w
  })

  test('rateCard: schedules, counts a new card for today, persists, unlocks', async () => {
    const { w, rec } = learningRecognize()
    const { store, repo } = makeStore({ words: [w], cards: [rec] })
    expect(newSeenToday(NOW)).toBe(0)
    const updated = await store.actions.rateCard(rec, 'good')
    expect(updated.fsrs.reps).toBe(1)
    expect(updated.fsrs.last_review).toBe(NOW)
    expect(newSeenToday(NOW)).toBe(1)
    expect(repo.cardList().find((c) => c.id === rec.id)!.fsrs.reps).toBe(1)
    expect(repo.cardList().some((c) => c.mode === 'produce')).toBe(true)
    // a card that is not new does not count again
    await store.actions.rateCard(updated, 'good')
    expect(newSeenToday(NOW)).toBe(1)
  })

  test('unlock errors are swallowed: rejected voice check, failed write', async () => {
    const { w, rec } = learningRecognize()
    const { store, repo } = makeStore({ words: [w], cards: [wordCard(w, 'recognize', { fsrs: fsrs({ state: 2, stability: 10 }) })] })
    audio.voice = 'reject'
    vi.spyOn(repo, 'saveWordBundle').mockRejectedValueOnce(new Error('offline'))
    await expect(store.actions.onCardReviewed(rec, 'good')).resolves.toBeUndefined()
    expect(repo.cardList().map((c) => c.mode)).toEqual(['recognize'])
    // without a voice or mp3, the next successful unlock skips listen
    audio.voice = false
    await store.actions.onCardReviewed(wordCard(w, 'recognize', { fsrs: fsrs({ state: 2, stability: 10 }) }), 'good')
    expect(repo.cardList().map((c) => c.mode).sort()).toEqual(['produce', 'recognize'])
  })

  test('applyEnabledModes: switching listen off suspends; back on resumes (audio checked per word)', async () => {
    const w = word('casa', 'дом', { modes: ['recognize', 'produce', 'cloze', 'listen'] })
    const cards = [wordCard(w, 'recognize', { fsrs: fsrs({ state: 2, stability: 10 }) }), wordCard(w, 'listen')]
    const { store, repo } = makeStore({ words: [w], cards })
    await store.actions.applyEnabledModes(['recognize', 'produce', 'cloze'], ['listen'])
    expect(repo.cardList().find((c) => c.mode === 'listen')!.suspended).toBe(true)
    audio.voice = false
    const r = await store.actions.applyEnabledModes(['recognize', 'produce', 'cloze', 'listen'], ['listen'])
    expect(repo.cardList().find((c) => c.mode === 'listen')!.suspended).toBeUndefined()
    await r.undo()
    expect(repo.cardList().find((c) => c.mode === 'listen')!.suspended).toBe(true)
  })
})

describe('legacy cleanup', () => {
  test('counts and deletes w:* / g:* cards only', async () => {
    const { store, repo } = makeStore({ cards: [card('w:t:1', { kind: 'word' }), card('g:r:1', { kind: 'word' }), card('ph:s:1', { kind: 'phrase' })] })
    expect(await store.actions.countLegacyWordCards()).toBe(2)
    expect(await store.actions.deleteLegacyWordCards()).toBe(2)
    expect(repo.cardList().map((c) => c.id)).toEqual(['ph:s:1'])
    expect(await store.actions.countLegacyWordCards()).toBe(0)
  })
})

describe('hooks', () => {
  test('outside the provider they throw', () => {
    expect(() => renderHook(() => words.useWords())).toThrow('Words hooks must be used inside <WordsProvider>')
  })

  test('selectors over the snapshot', async () => {
    const a = word('casa', 'дом', { lexId: 'casa#noun' })
    const { store } = makeStore({ words: [a], cards: [wordCard(a)] })
    provideContext(WordsContext, store)
    expect(renderHook(() => words.useWords()).result).toBe(store.getSnapshot())
    expect(renderHook(() => words.useWord('casa#noun')).result).toEqual(a)
    expect(renderHook(() => words.useWord(undefined)).result).toBeUndefined()
    expect(renderHook(() => words.useWordByLexId('casa#noun')).result).toEqual(a)
    expect(renderHook(() => words.useWordByLexId(undefined)).result).toBeUndefined()
    expect(renderHook(() => words.useWordsByLemma('  CASA ')).result).toEqual([a])
    const none = renderHook(() => words.useWordsByLemma('nada')).result
    expect(none).toEqual([])
    expect(renderHook(() => words.useWordsByLemma(undefined)).result).toBe(none)
    expect(renderHook(() => words.useWordIndex()).result.byId.size).toBe(1)
    expect(renderHook(() => words.useWordCards('casa#noun')).result).toHaveLength(1)
    const emptyCards = renderHook(() => words.useWordCards('nope')).result
    expect(emptyCards).toEqual([])
    expect(renderHook(() => words.useWordCards(undefined)).result).toBe(emptyCards)
    expect(renderHook(() => words.useWordStatus('casa#noun')).result).toBe('learning')
    expect(renderHook(() => words.useWordStatus(undefined)).result).toBeUndefined()
    expect(renderHook(() => words.useWordActions()).result).toBe(store.actions)
  })
})
