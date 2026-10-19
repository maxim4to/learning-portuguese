/**
 * Content invariants over the real content/ directory. scripts/validate.ts already runs the zod schemas, the
 * cross-references of src/content/build.ts (unique exercise ids, syllabus/requires/cycles, topicId), the
 * Brazilianism linter and (optionally) audio presence for `audio: true` items. This file re-asserts those as
 * regressions and adds what validate does not check:
 *   - every answer passes the app's own grader the way the UI submits it (fill-gap fields joined by " / ",
 *     order-words chips joined by " ", dictation = what is spoken),
 *   - ids unique across content kinds (tutor notes / word sources resolve ids without the kind),
 *   - prerequisites come before their dependants in the syllabus,
 *   - internal links (markdown links, cheat-sheet order list) resolve,
 *   - listen-* exercises have their mp3 (public/audio/<audioHash(text)>.mp3).
 * Offenders are listed in the assertion message; real content defects are marked `it.fails` + docs/testing-bugs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildContentIndex, type BuildResult } from '@/content/build'
import type { Exercise, ExerciseOf } from '@/content/schema'
import { audioHash } from '@/engine/audioHash'
import { normalize } from '@/engine/grading'
import { gradeTyped } from '@/features/exercises/grade'
import { lintText } from '../../scripts/brazilianisms'

const root = fileURLToPath(new URL('../..', import.meta.url))
const contentDir = join(root, 'content')
const audioDir = join(root, 'public', 'audio')

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : []
  })
}

const files: Record<string, unknown> = {}
for (const abs of walk(contentDir, '.json')) {
  if (abs.startsWith(join(contentDir, 'lexicon'))) continue
  files['/' + relative(root, abs).split('\\').join('/')] = JSON.parse(readFileSync(abs, 'utf8'))
}
let built: BuildResult
beforeAll(() => {
  built = buildContentIndex(files)
})

/** Every exercise with where it lives. */
const allExercises = () => [...built.index.exercises.values()]
const ofType = <T extends Exercise['type']>(...types: T[]) =>
  allExercises().filter((l) => (types as string[]).includes(l.exercise.type)) as unknown as { exercise: ExerciseOf<T>; ownerId: string }[]
const where = (l: { exercise: Exercise; ownerId: string }) => `${l.ownerId} › ${l.exercise.id}`
const gapCount = (prompt: string) => Math.max(1, (prompt.match(/_{3,}/g) ?? []).length)
const partCount = (answer: string) => answer.split(/\s*\/\s*/).length

/**
 * Can the order-words answer be built from the chips (each used at most once, joined by " ") so that the UI's
 * gradeTyped(sentence, [answer]) says «correct»? Backtracking with a normalized-prefix prune.
 */
function orderWordsSolvable(words: string[], answer: string): boolean {
  const target = normalize(answer)
  const used = new Array<boolean>(words.length).fill(false)
  const chosen: string[] = []
  let steps = 0
  const go = (): boolean => {
    if (++steps > 200_000) return false
    if (chosen.length && gradeTyped(chosen.join(' '), [answer]).verdict === 'correct') return true
    for (let i = 0; i < words.length; i++) {
      if (used[i]) continue
      const next = normalize([...chosen, words[i]].join(' '))
      if (!target.startsWith(next)) continue
      // prune duplicates: same chip text at the same depth
      if (words.slice(0, i).some((w, j) => !used[j] && w === words[i])) continue
      used[i] = true
      chosen.push(words[i])
      if (go()) return true
      chosen.pop()
      used[i] = false
    }
    return false
  }
  return go()
}

describe('content: build (same checks as npm run validate)', () => {
  it('builds without errors or missing references', () => {
    expect(built.errors).toEqual([])
    expect(built.missing).toEqual([])
  })

  it('has a non-trivial course (guards against an empty glob)', () => {
    const ix = built.index
    expect(ix.topics.size).toBeGreaterThan(40)
    expect(ix.situations.size).toBeGreaterThan(5)
    expect(ix.vocab.size).toBeGreaterThan(5)
    expect(ix.reading.size).toBeGreaterThan(3)
    expect(ix.diagnostic.questions.length).toBeGreaterThan(10)
    expect(ix.exercises.size).toBeGreaterThan(1000)
  })

  it('warnings are only «not referenced in syllabus» (no stray files)', () => {
    expect(built.warnings.filter((w) => !/not referenced in syllabus/.test(w))).toEqual([])
  })
})

describe('content: ids', () => {
  it('topic / situation / reading / vocab ids are unique across kinds (tutor notes are keyed by bare id)', () => {
    const ix = built.index
    const seen = new Map<string, string>()
    const dups: string[] = []
    for (const [kind, ids] of [
      ['topic', ix.topics.keys()],
      ['situation', ix.situations.keys()],
      ['reading', ix.reading.keys()],
      ['vocab', ix.vocab.keys()],
    ] as const) {
      for (const id of ids) {
        if (seen.has(id)) dups.push(`${id}: ${seen.get(id)} + ${kind}`)
        seen.set(id, kind)
      }
    }
    expect(dups).toEqual([])
  })

  it('syllabus module ids do not collide with topic ids', () => {
    const clash = [...built.index.modules.keys()].filter((m) => built.index.topics.has(m))
    expect(clash).toEqual([])
  })

  it('exercise ids follow <owner>-…: topic exercises start with their topic id', () => {
    const bad = allExercises()
      .filter((l) => (l.ownerKind === 'topic' || l.ownerKind === 'topic-minitest') && !l.exercise.id.startsWith(l.ownerId + '-'))
      .map(where)
    expect(bad).toEqual([])
  })

  it('phrase-card ids are unique: no duplicate pt phrase within a situation (cards ph:<situation>:<i> by text)', () => {
    const dups: string[] = []
    for (const s of built.index.situations.values()) {
      const seen = new Set<string>()
      for (const p of s.phrases) {
        const k = normalize(p.pt)
        if (seen.has(k)) dups.push(`${s.id}: ${p.pt}`)
        seen.add(k)
      }
    }
    expect(dups).toEqual([])
  })

  it('vocab themes: no duplicate pt word within a theme', () => {
    const dups: string[] = []
    for (const v of built.index.vocab.values()) {
      const seen = new Set<string>()
      for (const w of v.words) {
        const k = normalize(w.pt)
        if (seen.has(k)) dups.push(`${v.id}: ${w.pt}`)
        seen.add(k)
      }
    }
    expect(dups).toEqual([])
  })
})

describe('content: answers pass the app grader', () => {
  it('typed answers: every accepted variant grades «correct» against its own list and is not empty', () => {
    const bad: string[] = []
    for (const l of ofType('fill-gap', 'transform', 'translate-ru-pt', 'listen-type')) {
      for (const a of l.exercise.answer) {
        if (!normalize(a)) bad.push(`${where(l)}: empty after normalize «${a}»`)
        else if (gradeTyped(a, l.exercise.answer).verdict !== 'correct') bad.push(`${where(l)}: «${a}»`)
      }
    }
    expect(bad).toEqual([])
  })

  it('fill-gap: at least one variant has one part per gap (the UI has one field per gap, joined by " / ")', () => {
    const bad = ofType('fill-gap')
      .filter((l) => !l.exercise.answer.some((a) => partCount(a) === gapCount(l.exercise.prompt)))
      .map((l) => `${where(l)}: ${gapCount(l.exercise.prompt)} gap(s), answers ${JSON.stringify(l.exercise.answer)}`)
    expect(bad).toEqual([])
  })

  it('fill-gap: typing each part into its own field grades «correct»', () => {
    const bad: string[] = []
    for (const l of ofType('fill-gap')) {
      const n = gapCount(l.exercise.prompt)
      for (const a of l.exercise.answer) {
        const parts = a.split(/\s*\/\s*/)
        if (parts.length !== n) continue
        // what TextAnswer submits
        const submitted = parts.map((p) => p.trim()).join(' / ')
        if (gradeTyped(submitted, l.exercise.answer).verdict !== 'correct') bad.push(`${where(l)}: «${submitted}»`)
      }
    }
    expect(bad).toEqual([])
  })

  it('fill-gap: no dead variants (part count ≠ gap count can never be typed)', () => {
    const bad = ofType('fill-gap').flatMap((l) =>
      l.exercise.answer.filter((a) => partCount(a) !== gapCount(l.exercise.prompt)).map((a) => `${where(l)}: «${a}» vs ${gapCount(l.exercise.prompt)} gap(s)`),
    )
    expect(bad).toEqual([])
  })

  it('choice / listen-choice: the correct index exists and options are distinct after normalization', () => {
    const bad: string[] = []
    for (const l of ofType('choice', 'listen-choice')) {
      const { options, correct } = l.exercise
      if (!(correct >= 0 && correct < options.length)) bad.push(`${where(l)}: correct ${correct}`)
      const norm = options.map(normalize)
      if (new Set(norm).size !== norm.length) bad.push(`${where(l)}: options ${JSON.stringify(options)}`)
    }
    expect(bad).toEqual([])
  })

  it('order-words: the answer can be built from the chips and is graded «correct»', () => {
    const bad = ofType('order-words')
      .filter((l) => !orderWordsSolvable(l.exercise.words, l.exercise.answer))
      .map((l) => `${where(l)}: ${JSON.stringify(l.exercise.words)} → «${l.exercise.answer}»`)
    expect(bad).toEqual([])
  })

  it('listen-type: typing exactly what is spoken is accepted', () => {
    const bad = ofType('listen-type')
      .filter((l) => gradeTyped(l.exercise.text, l.exercise.answer).verdict !== 'correct')
      .map((l) => `${where(l)}: text «${l.exercise.text}» answers ${JSON.stringify(l.exercise.answer)}`)
    expect(bad).toEqual([])
  })

  it('match: left items distinct, right items distinct (each pair identifiable)', () => {
    const bad: string[] = []
    for (const l of ofType('match')) {
      const L = l.exercise.pairs.map((p) => normalize(p.left))
      const R = l.exercise.pairs.map((p) => normalize(p.right))
      if (new Set(L).size !== L.length) bad.push(`${where(l)}: duplicate left`)
      if (new Set(R).size !== R.length) bad.push(`${where(l)}: duplicate right`)
    }
    expect(bad).toEqual([])
  })

  it('diagnostic questions probe grammar topics of their own level', () => {
    const bad = built.index.diagnostic.questions
      .filter((q) => built.index.topics.get(q.topicId)?.level !== q.level)
      .map((q) => `${q.id}: level ${q.level}, topic ${q.topicId} (${built.index.topics.get(q.topicId)?.level})`)
    expect(bad).toEqual([])
  })
})

describe('content: prerequisites and links', () => {
  it('every `requires` exists, and there are no cycles (build)', () => {
    expect(built.errors.filter((e) => /requires/.test(e))).toEqual([])
    expect(built.missing.filter((e) => /requires/.test(e))).toEqual([])
  })

  const rank = { A1: 0, A2: 1, B1: 2, B2: 3 } as const
  /** [topic, prerequisite] pairs with both topics present. */
  const prereqPairs = () =>
    [...built.index.topics.values()].flatMap((t) => t.requires.filter((r) => built.index.topics.has(r)).map((r) => [t, built.index.topics.get(r)!] as const))

  it('prerequisites are not of a higher level than their dependant', () => {
    const bad = prereqPairs()
      .filter(([t, r]) => rank[r.level] > rank[t.level])
      .map(([t, r]) => `${t.id} (${t.level}) requires ${r.id} (${r.level})`)
    expect(bad).toEqual([])
  })

  // BUG A-13: see docs/testing-bugs/A.md — b1-conjuntivo-conjuncoes requires b1-futuro-conjuntivo, which the
  // syllabus lists two topics later: a learner following course order is told «Лучше сначала: …» a topic ahead.
  it.fails('prerequisites come earlier in the syllabus order (course order never points forward)', () => {
    const order = new Map(built.index.topicOrder.map((id, i) => [id, i]))
    const bad = prereqPairs()
      .filter(([t, r]) => order.get(r.id)! > order.get(t.id)!)
      .map(([t, r]) => `${t.id} requires ${r.id}, listed later`)
    expect(bad).toEqual([])
  })

  it('markdown links in content resolve to app routes or cheat-sheets', () => {
    const routes = [/^\/topic\/([a-z0-9-]+)$/, /^\/practice\/(situations|vocab|reading|cheatsheets)\/([a-z0-9-]+)$/]
    const cheats = new Set(walk(join(contentDir, 'cheatsheets'), '.md').map((p) => p.split('/').pop()!.replace(/\.md$/, '')))
    const ix = built.index
    const exists = (href: string) => {
      const t = routes[0].exec(href)
      if (t) return ix.topics.has(t[1])
      const p = routes[1].exec(href)
      if (!p) return /^https?:\/\//.test(href) || href.startsWith('#')
      const m = { situations: ix.situations, vocab: ix.vocab, reading: ix.reading } as Record<string, Map<string, unknown>>
      return p[1] === 'cheatsheets' ? cheats.has(p[2]) : m[p[1]].has(p[2])
    }
    const texts = [
      ...walk(join(contentDir, 'cheatsheets'), '.md').map((p) => [relative(root, p), readFileSync(p, 'utf8')] as const),
      ...Object.entries(files).map(([k, v]) => [k, JSON.stringify(v)] as const),
    ]
    const bad: string[] = []
    for (const [file, text] of texts) for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) if (!exists(m[1])) bad.push(`${file}: ${m[1]}`)
    expect(bad).toEqual([])
  })

  it('the cheat-sheet hub order lists existing cheat-sheets only', async () => {
    const src = readFileSync(join(root, 'src/features/library/cheatsheets.ts'), 'utf8')
    const block = /const ORDER = \[([\s\S]*?)\]/.exec(src)![1]
    const ids = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
    const missing = ids.filter((id) => !existsSync(join(contentDir, 'cheatsheets', `${id}.md`)))
    expect(ids.length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('tutor notes belong to an existing item (build)', () => {
    expect(built.errors.filter((e) => e.includes('/content/tutor/'))).toEqual([])
    for (const id of built.index.tutor.keys()) {
      const ix = built.index
      expect(ix.topics.has(id) || ix.situations.has(id) || ix.reading.has(id) || ix.vocab.has(id)).toBe(true)
    }
  })
})

describe('content: audio', () => {
  const mp3 = async (text: string) => existsSync(join(audioDir, `${await audioHash(text)}.mp3`))

  it('every listen-type / listen-choice text has its pre-generated mp3', async () => {
    const missing: string[] = []
    for (const l of ofType('listen-type', 'listen-choice')) if (!(await mp3(l.exercise.text))) missing.push(`${where(l)}: «${l.exercise.text}»`)
    expect(missing).toEqual([])
  })

  it('every `audio: true` example / vocab word has its mp3 (validate --check-audio only warns)', async () => {
    const missing: string[] = []
    for (const t of built.index.topics.values()) for (const e of t.examples) if (e.audio && !(await mp3(e.pt))) missing.push(`${t.id}: «${e.pt}»`)
    for (const v of built.index.vocab.values()) for (const w of v.words) if (w.audio && !(await mp3(w.pt))) missing.push(`${v.id}: «${w.pt}»`)
    expect(missing).toEqual([])
  })

  it('situation dialogues and reading paragraphs (voiced by npm run tts) have their mp3', async () => {
    const missing: string[] = []
    for (const s of built.index.situations.values()) for (const d of s.dialogue) if (!(await mp3(d.pt))) missing.push(`${s.id}: «${d.pt}»`)
    for (const r of built.index.reading.values()) for (const p of r.paragraphs) if (!(await mp3(p))) missing.push(`${r.id}: «${p.slice(0, 40)}…»`)
    expect(missing).toEqual([])
  })
})

describe('content: no Brazilianisms', () => {
  /** Same traversal as scripts/validate.ts lintValue (keys that are ru / discuss pt-BR are skipped; theory soft). */
  const SKIP = new Set(['ru', 'title', 'ptVsBr', 'commonErrors', 'hint', 'explanation', 'instruction', 'checklist', 'id', 'topicId', 'module', 'requires', 'tags', 'type', 'level', 'speaker', 'gender', 'theory'])
  function lint(value: unknown, path: string, out: string[]) {
    if (typeof value === 'string') for (const p of lintText(value)) out.push(`${path}: ${p}`)
    else if (Array.isArray(value)) value.forEach((v, i) => lint(v, `${path}[${i}]`, out))
    else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      for (const [k, v] of Object.entries(o)) {
        if (SKIP.has(k)) continue
        if (k === 'options' && Array.isArray(v) && typeof o.correct === 'number') lint(v[o.correct], `${path}.options[${o.correct}]`, out)
        else lint(v, `${path}.${k}`, out)
      }
    }
  }

  it('Portuguese strings (answers, prompts, texts, dialogues, correct options) are pt-PT', () => {
    const out: string[] = []
    for (const [file, data] of Object.entries(files)) lint(data, file, out)
    expect(out).toEqual([])
  })

  it('every accepted answer variant and dictation text is pt-PT (graded answers teach the norm)', () => {
    const out: string[] = []
    for (const l of allExercises()) {
      const ex = l.exercise as Exercise & { answer?: string | string[]; text?: string }
      for (const a of [ex.answer ?? []].flat()) for (const p of lintText(a)) out.push(`${where(l)}: «${a}» ${p}`)
      if (ex.text) for (const p of lintText(ex.text)) out.push(`${where(l)}: «${ex.text}» ${p}`)
    }
    expect(out).toEqual([])
  })
})

describe('the checks above are not vacuous', () => {
  it('every graded exercise kind is present in the course', () => {
    const kinds = new Set(allExercises().map((l) => l.exercise.type))
    for (const k of ['fill-gap', 'choice', 'transform', 'order-words', 'translate-ru-pt', 'listen-type', 'listen-choice', 'match'] as const) expect(kinds).toContain(k)
    expect(ofType('fill-gap').some((l) => gapCount(l.exercise.prompt) > 1)).toBe(true) // multi-gap path exercised
  })

  it('the order-words solver accepts buildable answers and rejects impossible ones', () => {
    expect(orderWordsSolvable(['Rui.', 'chama-se', 'Ele', 'não'], 'Ele chama-se Rui.')).toBe(true)
    expect(orderWordsSolvable(['de', 'manhã', 'Saio'], 'Saio de manhã')).toBe(true)
    expect(orderWordsSolvable(['Eu', 'sou'], 'Eu sou russo')).toBe(false)
    expect(orderWordsSolvable(['muito', 'bom'], 'muito muito bom')).toBe(false)
  })

  it('the audio check would notice a missing file', async () => {
    expect(existsSync(join(audioDir, `${await audioHash('esta frase não tem áudio 12345')}.mp3`))).toBe(false)
  })

  it('the Brazilianism linter fires on Brazilian forms', () => {
    expect(lintText('Vou pegar o ônibus.')).not.toEqual([])
    expect(lintText('Estou falando com ela.')).not.toEqual([])
  })
})
