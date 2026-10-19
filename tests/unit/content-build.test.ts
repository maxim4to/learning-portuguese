/**
 * src/content/build.ts on broken fixtures (every error / warning / missing branch), src/content/schema.ts
 * helpers, and the runtime loader src/content/index.ts over the real content (import.meta.glob) incl. the
 * «invalid content throws» path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildContentIndex, checkExerciseSemantics } from '@/content/build'
import { ExerciseSchema, LexEntrySchema, lexEntryId, type Exercise } from '@/content/schema'

// ─── fixtures ───────────────────────────────────────────────────────────────────────────────

const fill = (id: string, topicId: string, patch: Record<string, unknown> = {}) => ({ id, topicId, type: 'fill-gap', prompt: 'Eu ___ (ser) russo.', answer: ['sou'], ...patch })

function topic(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    level: 'A1',
    module: 'm1',
    title: 'Тема',
    titlePt: 'Tema',
    requires: [],
    theory: '## Теория',
    examples: [{ pt: 'Olá.', ru: 'Привет.' }],
    exercises: [fill(`${id}-ex-01`, id)],
    miniTest: [],
    ...patch,
  }
}
const syllabus = (modules: { id: string; topics: string[] }[], level = 'A1') => ({ levels: [{ level, modules: modules.map((m) => ({ title: 'Модуль', ...m })) }] })
const diagnostic = (topicId = 't1') => ({ questions: [{ ...fill('diag-001', topicId), level: 'A1' }] })
const situation = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  title: 'В кафе',
  titlePt: 'No café',
  level: 'A1',
  dialogue: [{ speaker: 'A', pt: 'Bom dia.', ru: 'Добрый день.' }],
  phrases: [{ pt: 'Um café, por favor.', ru: 'Кофе, пожалуйста.' }],
  vocab: [{ pt: 'a bica', ru: 'эспрессо' }],
  exercises: [],
  ...patch,
})
const reading = (id: string, patch: Record<string, unknown> = {}) => ({ id, level: 'A1', title: 'Текст', paragraphs: ['Olá.'], glossary: [], questions: [], ...patch })
const vocab = (id: string) => ({ id, title: 'Еда', words: [{ pt: 'o pão', ru: 'хлеб', gender: 'm' }] })

/** A valid minimal course; override / add files per test. */
function course(extra: Record<string, unknown> = {}) {
  return {
    '/content/syllabus.json': syllabus([{ id: 'm1', topics: ['t1'] }]),
    '/content/diagnostic.json': diagnostic(),
    '/content/grammar/t1.json': topic('t1'),
    ...extra,
  }
}

describe('buildContentIndex: valid input', () => {
  it('indexes every kind; the path prefix before /content/ is ignored', () => {
    const r = buildContentIndex(
      course({
        '/abs/project/content/situations/no-cafe.json': situation('no-cafe', { exercises: [fill('no-cafe-ex-01', 'no-cafe')] }),
        '/content/vocab/comida.json': vocab('comida'),
        '/content/reading/texto.json': reading('texto', { questions: [{ id: 'texto-q1', topicId: 't1', type: 'choice', prompt: '?', options: ['a', 'b'], correct: 1 }] }),
        '/content/tutor/no-cafe.json': { id: 'no-cafe', notes: 'Говори медленно.' },
      }),
    )
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.missing).toEqual([])
    const ix = r.index
    expect([ix.topics.size, ix.situations.size, ix.vocab.size, ix.reading.size, ix.tutor.size]).toEqual([1, 1, 1, 1, 1])
    expect(ix.modules.get('m1')?.level).toBe('A1')
    expect(ix.topicOrder).toEqual(['t1'])
    expect([...ix.exercises.keys()].sort()).toEqual(['diag-001', 'no-cafe-ex-01', 't1-ex-01', 'texto-q1'])
    expect(ix.exercises.get('texto-q1')).toMatchObject({ ownerKind: 'reading', ownerId: 'texto' })
    expect(ix.exercises.get('diag-001')).toMatchObject({ ownerKind: 'diagnostic', ownerId: 'diagnostic' })
  })

  it('topic order: syllabus order first, then topics not in the syllabus (with a warning)', () => {
    const r = buildContentIndex(
      course({
        '/content/syllabus.json': syllabus([{ id: 'm1', topics: ['t2', 't1'] }]),
        '/content/grammar/t2.json': topic('t2'),
        '/content/grammar/t0.json': topic('t0'),
      }),
    )
    expect(r.index.topicOrder).toEqual(['t2', 't1', 't0'])
    expect(r.warnings).toEqual(['topic "t0" is not referenced in syllabus.json'])
  })

  it('mini-test exercises are indexed as topic-minitest', () => {
    const r = buildContentIndex(course({ '/content/grammar/t1.json': topic('t1', { miniTest: [fill('t1-mt-01', 't1')] }) }))
    expect(r.index.exercises.get('t1-mt-01')?.ownerKind).toBe('topic-minitest')
  })
})

describe('buildContentIndex: broken fixtures', () => {
  it('no syllabus / diagnostic files', () => {
    const r = buildContentIndex({ '/content/grammar/t1.json': topic('t1') })
    expect(r.errors).toEqual(expect.arrayContaining(['/content/syllabus.json is missing', '/content/diagnostic.json is missing']))
    expect(r.index.syllabus).toEqual({ levels: [] })
    expect(r.index.diagnostic).toEqual({ questions: [] })
  })

  it('schema errors are reported with file and path; a root-level error says (root)', () => {
    const r = buildContentIndex(
      course({
        '/content/syllabus.json': 5,
        '/content/diagnostic.json': { questions: [] },
        '/content/grammar/t1.json': { ...topic('t1'), typo: true },
        '/content/vocab/v.json': { id: 'v', title: 'x', words: [] },
      }),
    )
    expect(r.errors.some((e) => e.startsWith('/content/syllabus.json: (root): '))).toBe(true)
    expect(r.errors.some((e) => e.startsWith('/content/diagnostic.json: questions: '))).toBe(true)
    expect(r.errors.some((e) => e.startsWith('/content/grammar/t1.json: ') && /typo/.test(e))).toBe(true)
    expect(r.errors.some((e) => e.startsWith('/content/vocab/v.json: words: '))).toBe(true)
    expect(r.index.topics.has('t1')).toBe(false) // invalid files are not indexed
  })

  it('non-kebab ids are rejected', () => {
    const r = buildContentIndex(course({ '/content/grammar/Bad_Id.json': topic('Bad_Id') }))
    expect(r.errors.some((e) => /kebab-case/.test(e))).toBe(true)
  })

  it('id must match the file name; the same file twice is a duplicate', () => {
    const r = buildContentIndex(
      course({
        '/content/grammar/other.json': topic('t9'),
        '/x/content/grammar/t1.json': topic('t1'), // normalizes to /content/grammar/t1.json again
      }),
    )
    expect(r.errors).toContain('/content/grammar/other.json: id "t9" must match the file name "other"')
    expect(r.errors).toContain('/content/grammar/t1.json: duplicate id "t1"')
  })

  it('unknown locations are ignored with a warning', () => {
    const r = buildContentIndex(course({ '/content/grammar/nested/t3.json': topic('t3'), '/content/notes.json': {} }))
    expect(r.warnings).toEqual(
      expect.arrayContaining(['/content/grammar/nested/t3.json: unknown content file location, ignored', '/content/notes.json: unknown content file location, ignored']),
    )
    expect(r.index.topics.has('t3')).toBe(false)
  })

  it('syllabus ↔ topics: duplicate module, topic listed twice, missing topic, wrong module, wrong level', () => {
    const r = buildContentIndex(
      course({
        '/content/syllabus.json': {
          levels: [
            { level: 'A1', modules: [{ id: 'm1', title: 'x', topics: ['t1', 't1', 'ghost'] }, { id: 'm1', title: 'y', topics: ['t2'] }] },
            { level: 'A2', modules: [{ id: 'm2', title: 'z', topics: ['t3'] }] },
          ],
        },
        '/content/grammar/t2.json': topic('t2', { module: 'elsewhere' }),
        '/content/grammar/t3.json': topic('t3', { module: 'm2' }), // level A1 in the file
      }),
    )
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'syllabus: duplicate module id "m1"',
        'syllabus: topic "t1" listed more than once',
        'topic "t2": module is "elsewhere" but syllabus lists it under "m1"',
        'topic "t3": level A1 but syllabus lists it under A2',
      ]),
    )
    expect(r.missing).toEqual(['syllabus: module "m1" references missing topic "ghost" (expected /content/grammar/ghost.json)'])
  })

  it('requires: unknown topic → missing; itself and longer cycles → errors', () => {
    const r = buildContentIndex(
      course({
        '/content/syllabus.json': syllabus([{ id: 'm1', topics: ['t1', 'a', 'b', 'c', 's'] }]),
        '/content/grammar/t1.json': topic('t1', { requires: ['nope'] }),
        '/content/grammar/a.json': topic('a', { requires: ['b'] }),
        '/content/grammar/b.json': topic('b', { requires: ['c'] }),
        '/content/grammar/c.json': topic('c', { requires: ['a'] }),
        '/content/grammar/s.json': topic('s', { requires: ['s'] }),
      }),
    )
    expect(r.missing).toEqual(['topic "t1": requires unknown topic "nope"'])
    expect(r.errors).toContain('topic "s": requires itself')
    expect(r.errors).toContain('requires cycle: a → b → c → a')
    expect(r.errors).toContain('requires cycle: s → s')
  })

  it('a diamond (two paths to one prerequisite) is not a cycle', () => {
    const r = buildContentIndex(
      course({
        '/content/syllabus.json': syllabus([{ id: 'm1', topics: ['t1', 'l', 'r', 'top'] }]),
        '/content/grammar/l.json': topic('l', { requires: ['t1'] }),
        '/content/grammar/r.json': topic('r', { requires: ['t1'] }),
        '/content/grammar/top.json': topic('top', { requires: ['l', 'r'] }),
      }),
    )
    expect(r.errors).toEqual([])
  })

  it('tutor notes for an unknown item', () => {
    const r = buildContentIndex(course({ '/content/tutor/ghost.json': { id: 'ghost', extraTasks: ['x'] } }))
    expect(r.errors).toEqual(['/content/tutor/ghost.json: no topic / situation / reading / vocab theme with id "ghost"'])
  })

  it('exercises: duplicate id across owners, unknown topicId, diagnostic must point at a grammar topic', () => {
    const r = buildContentIndex(
      course({
        '/content/diagnostic.json': diagnostic('no-cafe'),
        '/content/situations/no-cafe.json': situation('no-cafe', { exercises: [fill('t1-ex-01', 'no-cafe'), fill('no-cafe-ex-02', 'ghost-topic')] }),
      }),
    )
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'situation "no-cafe" exercise "t1-ex-01": duplicate exercise id (also in topic "t1")',
        'situation "no-cafe" exercise "no-cafe-ex-02": topicId "ghost-topic" does not exist',
        'diagnostic "diagnostic" exercise "diag-001": topicId "no-cafe" does not exist',
      ]),
    )
  })

  it('exercise semantics are reported with their location', () => {
    const r = buildContentIndex(course({ '/content/grammar/t1.json': topic('t1', { exercises: [fill('t1-ex-01', 't1', { prompt: 'Sem lacuna.' })] }) }))
    expect(r.errors).toEqual(['topic "t1" exercise "t1-ex-01": fill-gap prompt must contain "___"'])
  })
})

describe('checkExerciseSemantics', () => {
  const ex = (o: Record<string, unknown>) => ExerciseSchema.parse({ id: 'e', topicId: 't', ...o }) as Exercise

  it('choice / listen-choice: index range and duplicate options', () => {
    expect(checkExerciseSemantics(ex({ type: 'choice', prompt: 'p', options: ['a', 'b'], correct: 2 }))).toEqual(['correct index 2 out of range (2 options)'])
    expect(checkExerciseSemantics(ex({ type: 'listen-choice', text: 't', options: ['a', 'a'], correct: 0 }))).toEqual(['duplicate options'])
    expect(checkExerciseSemantics(ex({ type: 'choice', prompt: 'p', options: ['a', 'b'], correct: 1 }))).toEqual([])
  })

  it('order-words: answer tokens must come from the chips (punctuation/case ignored, distractors allowed, multiplicity counted)', () => {
    expect(checkExerciseSemantics(ex({ type: 'order-words', words: ['Ele', 'chama-se', 'Rui.', 'não'], answer: 'ele chama-se Rui' }))).toEqual([])
    expect(checkExerciseSemantics(ex({ type: 'order-words', words: ['Eu', 'sou'], answer: 'Eu sou russo.' }))[0]).toMatch(/token "russo" missing/)
    expect(checkExerciseSemantics(ex({ type: 'order-words', words: ['muito', 'bom'], answer: 'muito muito bom' }))[0]).toMatch(/token "muito" missing/)
  })

  it('match: duplicate left items', () => {
    expect(checkExerciseSemantics(ex({ type: 'match', pairs: [{ left: 'a', right: '1' }, { left: 'a', right: '2' }] }))).toEqual(['match: duplicate left items'])
    expect(checkExerciseSemantics(ex({ type: 'match', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '1' }] }))).toEqual([])
  })

  it('other kinds have no extra checks', () => {
    expect(checkExerciseSemantics(ex({ type: 'speak-shadow', text: 'Olá' }))).toEqual([])
    expect(checkExerciseSemantics(ex({ type: 'transform', prompt: 'p', instruction: 'i', answer: ['a'] }))).toEqual([])
    expect(checkExerciseSemantics(ex({ type: 'fill-gap', prompt: 'a ___', answer: ['b'] }))).toEqual([])
  })
})

describe('schema helpers', () => {
  it('lexEntryId: lemma#pos[#sense]', () => {
    expect(lexEntryId({ lemma: 'levantar-se', pos: 'verb' })).toBe('levantar-se#verb')
    expect(lexEntryId({ lemma: 'banco', pos: 'noun', sense: 2 })).toBe('banco#noun#2')
  })

  it('LexEntrySchema: strict, sense ≥ 2, at least one meaning', () => {
    expect(LexEntrySchema.safeParse({ lemma: 'casa', pos: 'noun', ru: ['дом'] }).success).toBe(true)
    expect(LexEntrySchema.safeParse({ lemma: 'casa', pos: 'noun', ru: [] }).success).toBe(false)
    expect(LexEntrySchema.safeParse({ lemma: 'casa', pos: 'noun', ru: ['дом'], sense: 1 }).success).toBe(false)
    expect(LexEntrySchema.safeParse({ lemma: 'casa', pos: 'noun', ru: ['дом'], extra: 1 }).success).toBe(false)
  })

  it('blank strings are rejected (trimmed non-empty)', () => {
    expect(ExerciseSchema.safeParse({ id: 'e', topicId: 't', type: 'speak-shadow', text: '   ' }).success).toBe(false)
  })
})

describe('runtime loader (src/content/index.ts)', () => {
  afterEach(() => {
    vi.doUnmock('@/content/build')
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('loads the real content and the accessors agree with the index', async () => {
    const c = await import('@/content')
    const ix = c.getContentIndex()
    expect(c.getSyllabus()).toBe(ix.syllabus)
    expect(c.getDiagnostic()).toBe(ix.diagnostic)
    const topics = c.listTopics()
    expect(topics.map((t) => t.id)).toEqual(ix.topicOrder)
    const first = topics[0]
    expect(c.getTopic(first.id)).toBe(first)
    expect(c.getModule(first.module)?.module.topics).toContain(first.id)
    expect(c.getModule('nope')).toBeUndefined()
    for (const l of c.LEVELS) expect(c.listTopicsByLevel(l).every((t) => t.level === l)).toBe(true)
    expect(c.listTopicsByLevel('A1').length).toBeGreaterThan(0)
    const s = c.listSituations()[0]
    expect(c.getSituation(s.id)).toBe(s)
    const v = c.listVocabThemes()[0]
    expect(c.getVocabTheme(v.id)).toBe(v)
    const r = c.listReadingTexts()[0]
    expect(c.getReadingText(r.id)).toBe(r)
    const [tutorId] = ix.tutor.keys()
    expect(c.getTutorNotes(tutorId)?.id).toBe(tutorId)
    expect(c.getTutorNotes('nope')).toBeUndefined()
    const ex = first.exercises[0]
    expect(c.findExercise(ex.id)?.exercise).toBe(ex)
    expect(c.findExercise('nope')).toBeUndefined()
    const sheets = c.listCheatsheets()
    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets.every((sh) => sh.markdown.length > 0 && !sh.id.includes('/'))).toBe(true)
    expect(c.getCheatsheet(sheets[0].id)?.markdown).toBe(sheets[0].markdown)
    expect(c.getCheatsheet('nope')).toBeUndefined()
    // the lexicon is not part of the content glob
    expect([...ix.topics.keys(), ...ix.vocab.keys()].some((id) => id.includes('lexicon'))).toBe(false)
  })

  it('invalid content throws ContentValidationError listing every problem', async () => {
    vi.resetModules()
    vi.doMock('@/content/build', () => ({
      buildContentIndex: () => ({ errors: ['a: broken', 'b: broken'], warnings: [], missing: [], index: {} }),
    }))
    const err = await import('@/content').then(
      () => null,
      (e: unknown) => e as Error & { problems?: string[] },
    )
    expect(err?.name).toBe('ContentValidationError')
    expect(err?.problems).toEqual(['a: broken', 'b: broken'])
    expect(err?.message).toBe('Content validation failed (2 problem(s)):\n- a: broken\n- b: broken')
  })

  it('soft problems (missing topics, warnings) only warn in DEV', async () => {
    vi.resetModules()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.doMock('@/content/build', async (orig) => {
      const real = await orig<typeof import('@/content/build')>()
      return { ...real, buildContentIndex: (f: Record<string, unknown>) => ({ ...real.buildContentIndex(f), missing: ['m: soon'], warnings: ['w: odd'] }) }
    })
    const c = await import('@/content')
    expect(c.listTopics().length).toBeGreaterThan(0)
    if (import.meta.env.DEV) expect(warn).toHaveBeenCalledWith('[content] warnings:\nm: soon\nw: odd')
  })
})
