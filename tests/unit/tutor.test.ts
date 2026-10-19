/**
 * «Практика с агентом»: text helpers, content lookups, modes, session persistence, prompt builders, clipboard.
 * scripts/integrations.test.ts already covers pickTutorWords priority, the 30-word cap, tutorWordLine basics and the
 * words-prompt snapshot — not repeated here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listReadingTexts, listSituations, listTopics, listVocabThemes, LEVELS, type Situation, type Topic } from '@/content'
import type { TopicProgress } from '@/data/types.ts'
import { bulleted, clip, compressMarkdown, exerciseLine, numbered, pickExerciseLines, stripInline } from '@/features/tutor/text'
import { MY_WORDS_ID, nextTopics, pickDaily, resolveTutorItem, shakyTopics, suggestedSituations } from '@/features/tutor/items'
import { CLAUDE_URL, DAILY_MODES, modeTitle, READING_MODES, SITUATION_MODES, TOPIC_MODES, VOCAB_MODES, WORDS_MODES } from '@/features/tutor/modes'
import { ASSESSMENTS, assessmentFromPct, parseScore, saveTutorSession, sessionScore, tutorHistory } from '@/features/tutor/persist'
import {
  buildDailyPrompt,
  buildReadingPrompt,
  buildSituationPrompt,
  buildTopicPrompt,
  buildVocabPrompt,
  buildWordsPrompt,
  pickTutorWords,
  tutorWordLine,
  type TutorWordState,
} from '@/features/tutor/prompts'
import { copyText } from '@/features/tutor/clipboard'
import { DAY, fsrs, NOW, progress } from '../fixtures/seed'
import { ex, FakeRepo } from '../helpers/A-feat-fixtures'

const pmap = (...ps: TopicProgress[]) => new Map(ps.map((p) => [p.topicId, p]))
const topics = listTopics()
const situations = listSituations()

// ─── text.ts ────────────────────────────────────────────────────────────────

describe('tutor/text: clip', () => {
  it('returns trimmed text unchanged when it fits', () => {
    expect(clip('  olá mundo  ', 20)).toBe('olá mundo')
    expect(clip('abc', 3)).toBe('abc')
  })
  it('cuts on a word boundary and appends «…», never exceeding max', () => {
    const s = 'Eu sou de Lisboa e moro no Porto há muitos anos'
    const out = clip(s, 20)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out).toBe('Eu sou de Lisboa e…')
  })
  it('hard-cuts when the last space is too early (≤ 60% of max)', () => {
    const out = clip('ab supercalifragilisticexpialidocious', 12)
    expect(out).toBe('ab supercal…')
    expect(out.length).toBe(12)
  })
  it('drops trailing punctuation before the ellipsis', () => {
    expect(clip('um, dois, três, quatro, cinco', 16)).toBe('um, dois, três…')
  })
})

describe('tutor/text: stripInline', () => {
  it('removes bold, underline-bold, italic and code markers', () => {
    expect(stripInline('**sou** __estou__ *ser* `ter`')).toBe('sou estou ser ter')
  })
  it('keeps asterisks inside words and list bullets alone', () => {
    expect(stripInline('a*b*c')).toBe('a*b*c')
    expect(stripInline('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
  it('keeps ✗/✓ marks', () => {
    expect(stripInline('✗ *eu é* → ✓ **eu sou**')).toBe('✗ eu é → ✓ eu sou')
  })
})

describe('tutor/text: compressMarkdown', () => {
  it('returns everything (plain) when it fits: headings ▸, tables a | b, separators dropped, \\r removed', () => {
    const md = '## Regra\r\nUsa-se **ser** para:\r\n\r\n| | falar | comer |\n|---|:---:|---|\n| eu | falo | como |'
    expect(compressMarkdown(md, 1000)).toBe('▸ Regra\nUsa-se ser para:\n\n· | falar | comer\neu | falo | como')
  })
  it('collapses 3+ blank lines and drops empty sections', () => {
    expect(compressMarkdown('a\n\n\n\nb\n## \n', 100)).toBe('a\n\nb\n\n▸')
    expect(compressMarkdown('', 100)).toBe('')
  })
  it('over budget: keeps every heading and the first lines, marking cut sections with «…»', () => {
    const long = (n: number) => Array.from({ length: n }, (_, i) => `linha ${i} com bastante texto para ocupar espaço`).join('\n')
    const md = `# A\n${long(30)}\n# B\ncurta\n# C\n${long(30)}`
    const out = compressMarkdown(md, 600)
    expect(out).toContain('▸ A')
    expect(out).toContain('▸ B\ncurta')
    expect(out).toContain('▸ C')
    expect(out.match(/\n…/g)?.length).toBe(2)
    // Budget roughly honoured (heading + «…» overhead allowed).
    expect(out.length).toBeLessThan(700)
  })
  it('trimmed sections skip lead-in lines ending with «:» and blank lines', () => {
    const md = `# T\nRegra principal\nExemplos seguintes:\n\n${'x'.repeat(50)}\n${'y'.repeat(400)}`
    const out = compressMarkdown(md, 120)
    expect(out).not.toContain('Exemplos seguintes:')
    expect(out.startsWith('▸ T\nRegra principal')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('tutor/text: exerciseLine / pickExerciseLines', () => {
  it('formats every kind; audio-only kinds give null', () => {
    expect(exerciseLine(ex.fillGap())).toBe('Eu ___ de Lisboa. → sou')
    expect(exerciseLine(ex.choice())).toBe('Ela ___ cansada. [é / está] → está')
    expect(exerciseLine(ex.transform())).toBe('Поставьте во множественное число: o carro → os carros')
    expect(exerciseLine(ex.orderWords())).toBe('Составить фразу из слов: sou / eu / professor → Eu sou professor.')
    expect(exerciseLine(ex.translate())).toBe('Перевести: «Я устал.» → Estou cansado.')
    expect(exerciseLine(ex.match())).toBe('Сопоставить: casa = дом; carro = машина')
    expect(exerciseLine(ex.listenType())).toBeNull()
    expect(exerciseLine(ex.listenChoice())).toBeNull()
    expect(exerciseLine(ex.speak())).toBeNull()
  })
  it('collapses whitespace and markdown in prompts', () => {
    expect(exerciseLine(ex.fillGap('x', { prompt: '  Eu   **___**\n de  Lisboa ' }))).toBe('Eu ___ de Lisboa → sou')
  })
  it('alternates types round-robin, respects n, skips lines > 260 chars and audio kinds', () => {
    const list = [
      ex.fillGap('f1', { answer: ['f1'] }),
      ex.fillGap('f2', { answer: ['f2'] }),
      ex.fillGap('f3', { answer: ['f3'] }),
      ex.choice('c1'),
      ex.listenType('l1'),
      ex.fillGap('long', { prompt: 'x'.repeat(300) }),
      ex.match('m1'),
    ]
    const out = pickExerciseLines(list, 5)
    expect(out).toHaveLength(5)
    expect(out[0]).toMatch(/→ f1$/)
    expect(out[1]).toMatch(/^Ela/)
    expect(out[2]).toMatch(/^Сопоставить/)
    expect(out[3]).toMatch(/→ f2$/)
    expect(out[4]).toMatch(/→ f3$/)
    expect(out.join('\n')).not.toContain('xxxx')
    expect(pickExerciseLines(list, 0)).toEqual([])
    expect(pickExerciseLines([], 3)).toEqual([])
    expect(pickExerciseLines(list, 99)).toHaveLength(5)
  })
  it('numbered / bulleted', () => {
    expect(numbered(['a', 'b'])).toBe('1. a\n2. b')
    expect(bulleted(['a', 'b'])).toBe('- a\n- b')
    expect(numbered([])).toBe('')
  })
})

// ─── items.ts ───────────────────────────────────────────────────────────────

describe('tutor/items: resolveTutorItem', () => {
  it('resolves «Мой словарь», topics, situations, readings and vocab themes to a title + tutor link', () => {
    expect(resolveTutorItem(MY_WORDS_ID)).toEqual({ id: MY_WORDS_ID, kind: 'words', title: 'Мой словарь', to: '/words#tutor' })
    const t = topics[0]
    expect(resolveTutorItem(t.id)).toEqual({ id: t.id, kind: 'topic', title: t.title, to: `/topic/${t.id}?tab=tutor` })
    const s = situations[0]
    expect(resolveTutorItem(s.id)).toEqual({ id: s.id, kind: 'situation', title: s.title, to: `/practice/situations/${s.id}?tab=tutor` })
    const r = listReadingTexts()[0]
    expect(resolveTutorItem(r.id)).toMatchObject({ kind: 'reading', title: r.title, to: `/practice/reading/${r.id}#tutor` })
    const v = listVocabThemes()[0]
    expect(resolveTutorItem(v.id)).toMatchObject({ kind: 'vocab', title: v.title, to: `/practice/vocab/${v.id}#tutor` })
  })
  it('unknown / empty ids → undefined', () => {
    expect(resolveTutorItem('no-such-thing')).toBeUndefined()
    expect(resolveTutorItem('')).toBeUndefined()
  })
})

describe('tutor/items: topic and situation suggestions', () => {
  it('shakyTopics: weak + learning only, weakest first', () => {
    const [a, b, c, d] = topics
    const m = pmap(progress(a.id, 7), progress(b.id, 2), progress(c.id, 10), progress(d.id, 5))
    expect(shakyTopics(m).map((x) => x.topic.id)).toEqual([b.id, d.id, a.id])
    expect(shakyTopics(new Map())).toEqual([])
  })
  it('nextTopics: unstarted topics in course order, at most n', () => {
    const m = pmap(progress(topics[0].id, 10), progress(topics[2].id, 1))
    expect(nextTopics(m, 2).map((t) => t.id)).toEqual([topics[1].id, topics[3].id])
    expect(nextTopics(m, 0)).toEqual([])
  })
  it('suggestedSituations: unstarted < weak < learning < confident; easier first; oldest practice first; maxLevel filter', () => {
    const all = suggestedSituations(new Map(), 999)
    expect(all.length).toBe(situations.length)
    const ranks = all.map((s) => LEVELS.indexOf(s.level))
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y))

    const a1 = suggestedSituations(new Map(), 999, 'A1')
    expect(a1.every((s) => s.level === 'A1')).toBe(true)

    const [s1, s2, s3] = all
    const m = pmap(progress(s1.id, 10), progress(s2.id, 2), progress(s3.id, 7))
    const ranked = suggestedSituations(m, 999).map((s) => s.id)
    expect(ranked.slice(-3)).toEqual([s2.id, s3.id, s1.id])

    // Same status and level → least recently practised first.
    const sameLevel = all.filter((s) => s.level === s1.level).slice(0, 2)
    if (sameLevel.length === 2) {
      const [x, y] = sameLevel
      const m2 = pmap(progress(x.id, 2, 10, { at: NOW }), progress(y.id, 2, 10, { at: NOW - 5 * DAY }))
      const r2 = suggestedSituations(m2, 999).map((s) => s.id)
      expect(r2.indexOf(y.id)).toBeLessThan(r2.indexOf(x.id))
    }
  })
  it('pickDaily: two weakest topics + a situation rotating by day', () => {
    const [a, b, c] = topics
    const m = pmap(progress(a.id, 5), progress(b.id, 1), progress(c.id, 3))
    const d1 = pickDaily(m, NOW)
    expect(d1.topics.map((t) => t.id)).toEqual([b.id, c.id])
    expect(d1.situation).toBeDefined()
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) seen.add(pickDaily(m, NOW + i * DAY).situation!.id)
    expect(seen.size).toBeGreaterThan(1)
    // Deterministic within the same day.
    expect(pickDaily(m, NOW + 1000).situation?.id).toBe(d1.situation?.id)
  })
  it('pickDaily: nothing shaky → the next unstarted topic; A1 widens situations to A2', () => {
    const d = pickDaily(new Map(), NOW)
    expect(d.topics.map((t) => t.id)).toEqual([topics[0].id])
    expect(['A1', 'A2']).toContain(d.situation?.level)
  })
  it('pickDaily: every topic confident → no topics, any-level situation', () => {
    const m = pmap(...topics.map((t) => progress(t.id, 10)))
    const d = pickDaily(m, NOW)
    expect(d.topics).toEqual([])
    expect(d.situation).toBeDefined()
  })
})

// ─── modes.ts ───────────────────────────────────────────────────────────────

describe('tutor/modes', () => {
  it('modeTitle: known ids, unknown and undefined fall back', () => {
    expect(modeTitle('explain')).toBe('Разобрать тему')
    expect(modeTitle('mywords')).toBe('Мои слова')
    expect(modeTitle('daily')).toBe('Свободная беседа дня')
    expect(modeTitle('nope')).toBe('Сессия с агентом')
    expect(modeTitle(undefined)).toBe('Сессия с агентом')
  })
  it('every mode has a unique id, title, description, duration and icon', () => {
    const all = [...TOPIC_MODES, ...SITUATION_MODES, ...READING_MODES, ...VOCAB_MODES, ...WORDS_MODES, ...DAILY_MODES]
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length)
    for (const m of all) {
      expect(m.title).toBeTruthy()
      expect(m.description).toBeTruthy()
      expect(m.minutes).toMatch(/\d+–\d+ мин/)
      expect(m.icon).toBeTruthy()
    }
    expect(CLAUDE_URL).toBe('https://claude.ai/new')
  })
})

// ─── persist.ts ─────────────────────────────────────────────────────────────

describe('tutor/persist: scores', () => {
  it('assessmentFromPct uses the 0.6 / 0.85 thresholds', () => {
    expect(assessmentFromPct(1)).toBe('easy')
    expect(assessmentFromPct(0.85)).toBe('easy')
    expect(assessmentFromPct(0.8499)).toBe('ok')
    expect(assessmentFromPct(0.6)).toBe('ok')
    expect(assessmentFromPct(0.5999)).toBe('hard')
    expect(assessmentFromPct(0)).toBe('hard')
  })
  it('parseScore: «Итог: N/M», «N из M», dashes, any case, spaces', () => {
    expect(parseScore('Итог: 8/10 · Оценка: легко')).toEqual({ correct: 8, total: 10 })
    expect(parseScore('итог — 7 из 12')).toEqual({ correct: 7, total: 12 })
    expect(parseScore('ИТОГ-3 / 4')).toEqual({ correct: 3, total: 4 })
    expect(parseScore('blah\nИтог 0/5')).toEqual({ correct: 0, total: 5 })
  })
  it('parseScore: missing, zero total, N > M, 4-digit numbers → undefined', () => {
    expect(parseScore('')).toBeUndefined()
    expect(parseScore('8/10 без слова')).toBeUndefined()
    expect(parseScore('Итог: 5/0')).toBeUndefined()
    expect(parseScore('Итог: 11/10')).toBeUndefined()
    expect(parseScore('Итог: 1000/10')).toBeUndefined()
    expect(parseScore('Итог: N/M')).toBeUndefined()
  })
  it('sessionScore: note score wins only when it agrees with the self-assessment band', () => {
    expect(sessionScore('easy', 'Итог: 9/10')).toEqual({ correct: 9, total: 10, fromNote: true })
    expect(sessionScore('hard', 'Итог: 9/10')).toEqual({ correct: 4, total: 10, fromNote: false })
    expect(sessionScore('ok')).toEqual({ correct: 7, total: 10, fromNote: false })
    expect(sessionScore('ok', 'просто заметка')).toEqual({ correct: 7, total: 10, fromNote: false })
    for (const a of ASSESSMENTS) expect(assessmentFromPct(a.score[0] / a.score[1])).toBe(a.id)
  })
})

describe('tutor/persist: saveTutorSession / tutorHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('credits every target with one tutor result at the same time; note trimmed and capped at 1000 chars', async () => {
    const repo = new FakeRepo()
    const note = `  Итог: 9/10 ${'x'.repeat(2000)}  `
    const out = await saveTutorSession(repo, { targetIds: ['t1', 't2'], mode: 'daily', assessment: 'easy', note })
    expect(out).toHaveLength(2)
    expect(repo.results).toHaveLength(2)
    for (const r of repo.results) {
      expect(r).toMatchObject({ correct: 9, total: 10, at: NOW, source: 'tutor', mode: 'daily' })
      expect(r.note).toHaveLength(1000)
      expect(r.note!.startsWith('Итог')).toBe(true)
    }
    expect(out[0].status).toBe('confident')
  })
  it('blank note is not stored; no targets → nothing saved', async () => {
    const repo = new FakeRepo()
    await saveTutorSession(repo, { targetIds: ['t1'], mode: 'drill', assessment: 'hard', note: '   ' })
    expect(repo.results[0]).not.toHaveProperty('note')
    expect(repo.results[0]).toMatchObject({ correct: 4, total: 10 })
    expect(await saveTutorSession(repo, { targetIds: [], mode: 'drill', assessment: 'ok' })).toEqual([])
  })
  it('tutorHistory groups a multi-item session, skips non-tutor results, newest first', async () => {
    const repo = new FakeRepo()
    await saveTutorSession(repo, { targetIds: ['t1', 't2'], mode: 'daily', assessment: 'ok', note: 'n1' })
    vi.setSystemTime(NOW + DAY)
    await saveTutorSession(repo, { targetIds: ['t1'], mode: 'explain', assessment: 'easy' })
    await repo.saveTopicResult({ topicId: 't1', correct: 1, total: 2, at: NOW + 2 * DAY, source: 'lesson' })
    const h = tutorHistory(await repo.getAllProgress())
    expect(h).toEqual([
      { at: NOW + DAY, mode: 'explain', note: undefined, correct: 10, total: 10, itemIds: ['t1'] },
      { at: NOW, mode: 'daily', note: 'n1', correct: 7, total: 10, itemIds: ['t1', 't2'] },
    ])
    expect(tutorHistory([])).toEqual([])
  })
  it('tutorHistory: same time, different modes are separate; duplicate ids in one group are kept once', () => {
    const r = (topicId: string, mode?: string) => ({ topicId, correct: 1, total: 1, at: NOW, source: 'tutor' as const, mode })
    const p1: TopicProgress = { ...progress('a', 1, 1), history: [r('a', 'x'), r('a', 'x'), r('a')] }
    const h = tutorHistory([p1])
    expect(h).toHaveLength(2)
    expect(h.find((e) => e.mode === 'x')!.itemIds).toEqual(['a'])
  })
})

// ─── prompts.ts ─────────────────────────────────────────────────────────────

const TOPIC_MODE_IDS = ['explain', 'drill', 'conversation'] as const

describe('tutor/prompts: topic', () => {
  const t = topics.find((x) => x.ptVsBr && x.commonErrors && x.examples.length) ?? topics[0]

  it.each(TOPIC_MODE_IDS)('%s: header, standard blocks, finale with «Итог: N/M»', (mode) => {
    const p = buildTopicPrompt(t, mode)
    expect(p).toContain(`Тема: «${t.title}» (${t.titlePt}), уровень ${t.level}`)
    expect(p).toContain('НОРМА: ТОЛЬКО ЕВРОПЕЙСКИЙ ПОРТУГАЛЬСКИЙ')
    expect(p).toContain('Итог: N/M · Оценка')
    expect(p).toContain('МАТЕРИАЛ ТЕМЫ')
    expect(p).not.toMatch(/\n{3,}/)
    expect(p).not.toContain('undefined')
    expect(p).not.toContain('[object')
  })
  it('bank only for explain / drill; examples not in drill', () => {
    expect(buildTopicPrompt(t, 'drill')).toContain('БАНК ЗАДАНИЙ')
    expect(buildTopicPrompt(t, 'conversation')).not.toContain('БАНК ЗАДАНИЙ')
    expect(buildTopicPrompt(t, 'drill')).not.toContain('Примеры (pt-PT)')
    expect(buildTopicPrompt(t, 'conversation')).toContain('Примеры (pt-PT)')
  })
  it('extra notes and tasks are included (tasks only where there is a bank)', () => {
    const extra = { id: t.id, notes: '  Особое внимание: X  ', extraTasks: ['Доп. задание 1'] }
    const p = buildTopicPrompt(t, 'drill', extra)
    expect(p).toContain('ДОПОЛНИТЕЛЬНО ДЛЯ ЭТОЙ ТЕМЫ\nОсобое внимание: X')
    expect(p).toContain('Доп. задание 1')
    expect(buildTopicPrompt(t, 'conversation', extra)).not.toContain('Доп. задание 1')
  })
  it('a topic without ptVsBr / commonErrors / examples / exercises omits those blocks; a long theory is marked as cut', () => {
    const bare: Topic = { ...t, ptVsBr: undefined, commonErrors: undefined, examples: [], exercises: [], miniTest: [], theory: `# R\n${'linha longa de teoria\n'.repeat(400)}` }
    const p = buildTopicPrompt(bare, 'explain')
    expect(p).not.toContain('pt-PT vs pt-BR:')
    expect(p).not.toContain('Типичные ошибки русскоязычных')
    expect(p).not.toContain('Примеры (pt-PT)')
    expect(p).not.toContain('БАНК ЗАДАНИЙ')
    expect(p).toContain('он сокращён')
  })
  it('every real topic × mode stays within the ~8k character target', () => {
    for (const topic of topics) for (const mode of TOPIC_MODE_IDS) expect(buildTopicPrompt(topic, mode).length, `${topic.id}/${mode}`).toBeLessThan(9000)
  })
})

describe('tutor/prompts: situation / reading / vocab', () => {
  const s = situations.find((x) => x.writingTask) ?? situations[0]

  it('roleplay vs dialogue: different task, dialogue with/without translation, phrase hints', () => {
    const rp = buildSituationPrompt(s, 'roleplay')
    const dl = buildSituationPrompt(s, 'dialogue')
    expect(rp).toContain('сыграть со мной сценку')
    expect(rp).toContain('ДИАЛОГ-КАНВА')
    expect(rp).toContain('сам их не подсказывай')
    expect(dl).toContain('ДИАЛОГ (с переводом)')
    expect(dl).toContain(`(${s.dialogue[0].ru})`)
    expect(dl).toContain('КАК ИСПРАВЛЯТЬ')
    if (s.writingTask) expect(dl).toContain('письменное задание')
  })
  it('long dialogues are cut with «…»; empty phrases / vocab omitted; extra tasks listed', () => {
    const line = { speaker: 'A' as const, pt: 'Frase muito comprida '.repeat(10), ru: 'перевод '.repeat(10) }
    const big: Situation = { ...s, dialogue: Array.from({ length: 60 }, () => line), phrases: [], vocab: [], writingTask: undefined }
    const p = buildSituationPrompt(big, 'roleplay', { id: s.id, extraTasks: ['T1', 'T2'] })
    expect(p).toMatch(/\n…\n/)
    expect(p).not.toContain('КЛЮЧЕВЫЕ ФРАЗЫ')
    expect(p).not.toContain('ЛЕКСИКА:')
    expect(p).toContain('ДОПОЛНИТЕЛЬНЫЕ ЗАДАНИЯ:\n1. T1\n2. T2')
    expect(buildSituationPrompt(big, 'dialogue')).not.toContain('письменное задание')
  })
  it('every real situation × mode stays within ~8k', () => {
    for (const x of situations) for (const m of ['roleplay', 'dialogue'] as const) expect(buildSituationPrompt(x, m).length, `${x.id}/${m}`).toBeLessThan(9000)
  })
  it('reading: text clipped to 3000, glossary, extra tasks', () => {
    const r = listReadingTexts()[0]
    const p = buildReadingPrompt(r, { id: r.id, notes: 'N', extraTasks: ['E'] })
    expect(p).toContain(`Текст: «${r.title}», уровень ${r.level}`)
    expect(p).toContain('ТЕКСТ\n')
    if (r.glossary.length) expect(p).toContain('ГЛОССАРИЙ: ')
    expect(p).toContain('ДОПОЛНИТЕЛЬНЫЕ ЗАДАНИЯ:\n1. E')
    const huge = buildReadingPrompt({ ...r, paragraphs: ['palavra '.repeat(2000)], glossary: [] })
    expect(huge).not.toContain('ГЛОССАРИЙ')
    expect(huge).toMatch(/palavra…/)
  })
  it('vocab: gender marks only without an article, level defaults to A2, ≤ 60 words, optional titlePt', () => {
    const v = listVocabThemes()[0]
    const words = [
      { pt: 'casa', ru: 'дом', gender: 'f' as const },
      { pt: 'o carro', ru: 'машина', gender: 'm' as const },
      { pt: 'estudante', ru: 'студент', gender: 'mf' as const },
      { pt: 'bem', ru: 'хорошо' },
      ...Array.from({ length: 70 }, (_, i) => ({ pt: `w${i}`, ru: `r${i}` })),
    ]
    const p = buildVocabPrompt({ ...v, level: undefined, titlePt: undefined, words }, { id: v.id, extraTasks: ['E'] })
    expect(p).toContain('casa (f) — дом')
    expect(p).toContain('o carro — машина')
    expect(p).toContain('estudante (m/f) — студент')
    expect(p).toContain('bem — хорошо')
    expect(p).toContain(`Тема: «${v.title}», уровень A2, 74 слов.`)
    expect(p).toContain('w55 — r55')
    expect(p).not.toContain('w56 — r56')
    expect(p).toContain('ДОПОЛНИТЕЛЬНЫЕ ЗАДАНИЯ')
    const withPt = buildVocabPrompt({ ...v, titlePt: 'Casa', level: 'B1' })
    expect(withPt).toContain(`«${v.title}» (Casa), уровень B1`)
  })
})

describe('tutor/prompts: daily', () => {
  it('two topics + situation: smaller theory budget, per-topic verdict line, scene step', () => {
    const p = buildDailyPrompt({ topics: topics.slice(0, 2), situation: situations[0] })
    expect(p).toContain('ТЕМА 1:')
    expect(p).toContain('ТЕМА 2:')
    expect(p).toContain(`СИТУАЦИЯ: «${situations[0].title}»`)
    expect(p).toContain('2. Сценка')
    expect(p).toContain('тема — уверенно / нужно повторить')
    expect(p).toContain(` и ситуация «${situations[0].title}»`)
  })
  it('no topics and no situation → still a valid prompt (A2 level hint, no per-topic line)', () => {
    const p = buildDailyPrompt({ topics: [] })
    expect(p).toContain('A2 — простые фразы')
    expect(p).not.toContain('ТЕМА 1')
    expect(p).not.toContain('СИТУАЦИЯ')
    expect(p).toContain('2. Продолжи разговор')
    expect(p).not.toContain('тема — уверенно')
    expect(p).not.toContain('undefined')
  })
  it('level comes from the situation, else from the first topic', () => {
    const b = topics.find((t) => t.level === 'B1')!
    expect(buildDailyPrompt({ topics: [b] })).toContain(LEVEL_LINE('B1'))
    const s = situations.find((x) => x.level === 'A1')
    if (s) expect(buildDailyPrompt({ topics: [b], situation: s })).toContain(LEVEL_LINE('A1'))
  })
})
const LEVEL_LINE = (l: string) => `${l} — `

describe('tutor/prompts: words (edge cases beyond integrations.test.ts)', () => {
  it('tutorWordLine: article only for m/f nouns; mf noun keeps bare lemma; unknown pos has no tags', () => {
    expect(tutorWordLine({ lemma: 'estudante', pos: 'noun', gender: 'mf', ru: 'студент' })).toBe('estudante (сущ., м./ж. р.) — студент; пример: нет — придумай сам')
    expect(tutorWordLine({ lemma: 'saudade', ru: 'тоска' })).toBe('saudade — тоска; пример: нет — придумай сам')
    expect(tutorWordLine({ lemma: 'bonito', pos: 'adj', gender: 'm', ru: 'красивый', example: 'É bonito.' })).toBe('bonito (прил.) — красивый; пример: «É bonito.»')
  })
  it('tutorWordLine clips long examples', () => {
    const line = tutorWordLine({ lemma: 'a', ru: 'b', example: 'palavra '.repeat(50), exampleRu: 'слово '.repeat(50) })
    expect(line).toMatch(/…» \(.*…\)$/)
  })
  it('buildWordsPrompt: empty list, level option', () => {
    const p = buildWordsPrompt([], { level: 'B2' })
    expect(p).toContain('Слов: 0.')
    expect(p).toContain('B2 — развёрнутая речь')
  })
  it('pickTutorWords: suspended cards are ignored, known-marked and known/paused words skipped, words without reviewed cards sort by recency', () => {
    const st = (id: string, status: TutorWordState['status'], cards: TutorWordState['cards'], createdAt = NOW, mark?: 'known'): TutorWordState => ({
      entry: { id, lemma: id, ru: id, sources: [{ src: 'manual', form: id, at: NOW, sentence: '  Frase.  ', sentenceRu: ' Фраза. ' }], createdAt, mark },
      status,
      cards,
    })
    const items = [
      st('susp-due', 'learning', [{ suspended: true, fsrs: fsrs({ due: NOW - DAY }) }]),
      st('due', 'learning', [{ fsrs: fsrs({ due: NOW - DAY }) }]),
      st('marked', 'learning', [{ fsrs: fsrs() }], NOW, 'known'),
      st('known', 'known', [{ fsrs: fsrs() }]),
      st('paused', 'paused', [{ fsrs: fsrs() }]),
      st('new-old', 'new', [], NOW - 5 * DAY),
      st('new-young', 'new', [], NOW),
    ]
    const out = pickTutorWords(items, NOW)
    expect(out.map((w) => w.lemma)).toEqual(['due', 'susp-due', 'new-young', 'new-old'])
    expect(out[0]).toMatchObject({ example: 'Frase.', exampleRu: 'Фраза.' })
    expect(pickTutorWords(items, NOW, 1)).toHaveLength(1)
  })
})

// ─── clipboard.ts ───────────────────────────────────────────────────────────

describe('tutor/clipboard: copyText', () => {
  afterEach(() => vi.unstubAllGlobals())

  function legacyDom(execResult: boolean | 'throw', range = true) {
    const ta = {
      value: '',
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn(),
    }
    const prev = { id: 'range' }
    const sel = { rangeCount: range ? 1 : 0, getRangeAt: vi.fn(() => prev), removeAllRanges: vi.fn(), addRange: vi.fn() }
    const doc = {
      createElement: vi.fn(() => ta),
      body: { appendChild: vi.fn() },
      getSelection: vi.fn(() => sel),
      execCommand: vi.fn(() => {
        if (execResult === 'throw') throw new Error('nope')
        return execResult
      }),
    }
    vi.stubGlobal('document', doc)
    return { ta, sel, doc, prev }
  }

  it('uses the async Clipboard API in a secure context', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', { isSecureContext: true })
    const { doc } = legacyDom(true)
    expect(await copyText('olá')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('olá')
    expect(doc.createElement).not.toHaveBeenCalled()
  })
  it('falls back to execCommand when writeText rejects, restoring the previous selection', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    vi.stubGlobal('window', { isSecureContext: true })
    const { ta, sel, doc, prev } = legacyDom(true)
    expect(await copyText('texto')).toBe(true)
    expect(ta.value).toBe('texto')
    expect(ta.setAttribute).toHaveBeenCalledWith('readonly', '')
    expect(ta.style.fontSize).toBe('16px')
    expect(ta.setSelectionRange).toHaveBeenCalledWith(0, 5)
    expect(doc.execCommand).toHaveBeenCalledWith('copy')
    expect(ta.remove).toHaveBeenCalled()
    expect(sel.addRange).toHaveBeenCalledWith(prev)
  })
  it('insecure context / no Clipboard API → legacy path; execCommand false or throwing → false', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', { isSecureContext: false })
    legacyDom(false, false)
    expect(await copyText('x')).toBe(false)
    const { ta, sel } = legacyDom('throw', false)
    expect(await copyText('x')).toBe(false)
    expect(ta.remove).toHaveBeenCalled()
    expect(sel.addRange).not.toHaveBeenCalled()
  })
})
