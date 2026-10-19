/**
 * src/features/words/source.ts — `kind:id[:part[:index]]` encoding, labels, links back to the material, lookup attrs.
 * Content ids are taken from the real content index (first of each kind), so the tests survive content edits.
 */
import { describe, expect, test } from 'vitest'
import { getContentIndex, listCheatsheets, listReadingTexts, listSituations, listTopics, listVocabThemes } from '@/content'
import {
  SOURCE_GROUP_LABEL,
  decodeSource,
  encodeSource,
  lookupAttrs,
  sourceGroup,
  sourceHref,
  sourceLabel,
  sourceTitle,
  wordHref,
  type PtSource,
} from '@/features/words/source'

const theme = listVocabThemes()[0]
const situation = listSituations()[0]
const reading = listReadingTexts()[0]
const topic = listTopics()[0]
const sheet = listCheatsheets()[0]

/** First exercise id of each owner kind. */
const exByOwner = new Map<string, { id: string; ownerId: string }>()
for (const [id, loc] of getContentIndex().exercises) if (!exByOwner.has(loc.ownerKind)) exByOwner.set(loc.ownerKind, { id, ownerId: loc.ownerId })
const ex = (kind: string) => {
  const e = exByOwner.get(kind)
  if (!e) throw new Error(`no ${kind} exercise in content`)
  return e
}

describe('encodeSource / decodeSource', () => {
  test.each<[PtSource, string]>([
    [{ kind: 'manual', id: '' }, 'manual'],
    [{ kind: 'manual', id: 'tutor' }, 'manual:tutor'],
    [{ kind: 'manual', id: 'import' }, 'manual:import'],
    [{ kind: 'vocab', id: 'saude' }, 'vocab:saude'],
    [{ kind: 'situation', id: 'cafe', part: 'vocab', index: 3 }, 'situation:cafe:vocab:3'],
    [{ kind: 'situation', id: 'cafe', part: 'dialogue', index: 0 }, 'situation:cafe:dialogue:0'],
    [{ kind: 'reading', id: 'r', part: 'paragraph' }, 'reading:r:paragraph'],
    [{ kind: 'vocab', id: 't', index: 2 }, 'vocab:t::2'],
  ])('%j ⇄ %s', (src, encoded) => {
    expect(encodeSource(src)).toBe(encoded)
    const back = decodeSource(encoded)
    expect(back.kind).toBe(src.kind)
    expect(back.id).toBe(src.id)
    expect(back.part).toBe(src.part)
    expect(back.index).toBe(src.index)
  })

  test('index 0 survives the round trip (not dropped as falsy)', () => {
    expect(decodeSource(encodeSource({ kind: 'topic', id: 't', part: 'examples', index: 0 })).index).toBe(0)
  })

  test('malformed strings decode to something safe', () => {
    expect(decodeSource('')).toEqual({ kind: 'manual', id: '', part: undefined, index: undefined })
    expect(decodeSource('vocab')).toEqual({ kind: 'vocab', id: '', part: undefined, index: undefined })
    expect(decodeSource('situation:x:dialogue:abc').index).toBeUndefined()
    expect(decodeSource('situation:x:dialogue:').index).toBeUndefined()
    expect(decodeSource('situation:x:dialogue:Infinity').index).toBeUndefined()
    expect(decodeSource('situation:x:dialogue:-1').index).toBe(-1)
    expect(decodeSource('situation:x::5')).toMatchObject({ part: undefined, index: 5 })
  })
})

describe('sourceGroup', () => {
  test.each([
    ['vocab:x', 'vocab'],
    ['situation:x:vocab:1', 'situation'],
    ['reading:x:paragraph:0', 'reading'],
    ['manual', 'manual'],
    ['manual:tutor', 'manual'],
    ['', 'manual'],
    ['topic:x', 'other'],
    ['exercise:x', 'other'],
    ['cheatsheet:x', 'other'],
    ['review:lex:a:recognize', 'other'],
    ['writing:x', 'other'],
    ['bogus:x', 'other'],
  ])('%s → %s', (src, group) => {
    expect(sourceGroup(src)).toBe(group)
    expect(SOURCE_GROUP_LABEL[sourceGroup(src)]).toBeTruthy()
  })
})

describe('sourceTitle', () => {
  test('content kinds resolve to the content title', () => {
    expect(sourceTitle(`vocab:${theme.id}`)).toBe(theme.title)
    expect(sourceTitle(`situation:${situation.id}:vocab:1`)).toBe(situation.title)
    expect(sourceTitle(`reading:${reading.id}`)).toBe(reading.title)
    expect(sourceTitle(`topic:${topic.id}`)).toBe(topic.title)
  })

  test('cheatsheet: the first markdown H1', () => {
    const h1 = sheet.markdown.match(/^#\s+(.+)$/m)?.[1].trim()
    expect(h1).toBeTruthy()
    expect(sourceTitle(`cheatsheet:${sheet.id}`)).toBe(h1)
  })

  test('exercise: the owner title by kind, «Диагностика» for diagnostic questions', () => {
    expect(sourceTitle(`exercise:${ex('topic').id}`)).toBe(getContentIndex().topics.get(ex('topic').ownerId)?.title)
    expect(sourceTitle(`exercise:${ex('topic-minitest').id}`)).toBe(getContentIndex().topics.get(ex('topic-minitest').ownerId)?.title)
    expect(sourceTitle(`exercise:${ex('situation').id}`)).toBe(getContentIndex().situations.get(ex('situation').ownerId)?.title)
    expect(sourceTitle(`exercise:${ex('reading').id}`)).toBe(getContentIndex().reading.get(ex('reading').ownerId)?.title)
    expect(sourceTitle(`exercise:${ex('diagnostic').id}`)).toBe('Диагностика')
  })

  test('unknown ids / kinds → undefined', () => {
    for (const k of ['vocab', 'situation', 'reading', 'topic', 'cheatsheet', 'exercise']) expect(sourceTitle(`${k}:no-such-id`)).toBeUndefined()
    expect(sourceTitle('manual')).toBeUndefined()
    expect(sourceTitle('review:x')).toBeUndefined()
    expect(sourceTitle('writing:x')).toBeUndefined()
  })
})

describe('sourceLabel', () => {
  test('manual variants', () => {
    expect(sourceLabel('manual')).toBe('Добавлено вручную')
    expect(sourceLabel('manual:tutor')).toBe('Из беседы с агентом')
    expect(sourceLabel('manual:import')).toBe('Импорт списка')
    expect(sourceLabel('manual:other')).toBe('Добавлено вручную')
    expect(sourceLabel('')).toBe('Добавлено вручную')
  })

  test('kind + title + part (numbered parts are 1-based)', () => {
    expect(sourceLabel(`vocab:${theme.id}`)).toBe(`Тема «${theme.title}»`)
    expect(sourceLabel(`situation:${situation.id}:vocab:4`)).toBe(`Ситуация «${situation.title}» · лексика`)
    expect(sourceLabel(`situation:${situation.id}:dialogue:0`)).toBe(`Ситуация «${situation.title}» · реплика 1`)
    expect(sourceLabel(`situation:${situation.id}:phrases:2`)).toBe(`Ситуация «${situation.title}» · фразы 3`)
    expect(sourceLabel(`reading:${reading.id}:paragraph:2`)).toBe(`Текст «${reading.title}» · абзац 3`)
    expect(sourceLabel(`reading:${reading.id}:glossary:2`)).toBe(`Текст «${reading.title}» · глоссарий`)
    expect(sourceLabel(`topic:${topic.id}:examples:0`)).toBe(`Урок «${topic.title}» · пример 1`)
    expect(sourceLabel(`topic:${topic.id}:examples`)).toBe(`Урок «${topic.title}» · пример`)
    expect(sourceLabel(`exercise:${ex('diagnostic').id}`)).toBe('Упражнение «Диагностика»')
    expect(sourceLabel(`exercise:${ex('topic').id}:feedback`)).toMatch(/ · разбор ответа$/)
    expect(sourceLabel(`situation:${situation.id}:writing:0`)).toBe(`Ситуация «${situation.title}» · письмо`)
  })

  test('unknown content id: the raw id as the title; unknown part ignored', () => {
    expect(sourceLabel('vocab:gone-theme')).toBe('Тема «gone-theme»')
    expect(sourceLabel('review:lex:x:recognize')).toBe('Повторение «lex»')
    expect(sourceLabel('writing:w1:sample')).toBe('Письмо «w1» · образец')
    expect(sourceLabel('topic:t:nonsense:3')).toBe('Урок «t»')
  })

  // A-18 (fixed): a source with an unknown kind (older/newer build, corrupted data) gets a neutral label.
  test('unknown kind never renders the word «undefined»', () => {
    expect(sourceLabel('podcast:ep1')).not.toMatch(/undefined/)
    expect(sourceLabel('podcast:ep1')).toBe('Источник «ep1»')
  })
})

describe('sourceHref', () => {
  test('vocab: theme page; examples part scrolls to the word', () => {
    expect(sourceHref(`vocab:${theme.id}`)).toBe(`/practice/vocab/${theme.id}`)
    expect(sourceHref(`vocab:${theme.id}:examples:4`)).toBe(`/practice/vocab/${theme.id}#w-4`)
    expect(sourceHref(`vocab:${theme.id}:examples`)).toBe(`/practice/vocab/${theme.id}`)
    expect(sourceHref(`vocab:${theme.id}:vocab:4`)).toBe(`/practice/vocab/${theme.id}`)
  })

  test('situation: tab + anchor per part', () => {
    const base = `/practice/situations/${situation.id}`
    expect(sourceHref(`situation:${situation.id}`)).toBe(base)
    expect(sourceHref(`situation:${situation.id}:dialogue:3`)).toBe(`${base}#dlg-line-3`)
    expect(sourceHref(`situation:${situation.id}:dialogue`)).toBe(base)
    expect(sourceHref(`situation:${situation.id}:phrases:0`)).toBe(`${base}?tab=phrases#ph-0`)
    expect(sourceHref(`situation:${situation.id}:vocab:7`)).toBe(`${base}?tab=vocab#voc-7`)
    expect(sourceHref(`situation:${situation.id}:writing`)).toBe(`${base}?tab=writing#writing-sample`)
    expect(sourceHref(`situation:${situation.id}:examples:1`)).toBe(base)
  })

  test('reading: paragraph / glossary anchors', () => {
    const base = `/practice/reading/${reading.id}`
    expect(sourceHref(`reading:${reading.id}`)).toBe(base)
    expect(sourceHref(`reading:${reading.id}:paragraph:2`)).toBe(`${base}#p-2`)
    expect(sourceHref(`reading:${reading.id}:glossary:5`)).toBe(`${base}#gl-5`)
    expect(sourceHref(`reading:${reading.id}:other:5`)).toBe(base)
  })

  test('topic, cheatsheet', () => {
    expect(sourceHref(`topic:${topic.id}`)).toBe(`/topic/${topic.id}`)
    expect(sourceHref(`topic:${topic.id}:examples:2`)).toBe(`/topic/${topic.id}?tab=examples#ex-2`)
    expect(sourceHref(`topic:${topic.id}:examples`)).toBe(`/topic/${topic.id}?tab=examples`)
    expect(sourceHref(`cheatsheet:${sheet.id}`)).toBe(`/practice/cheatsheets/${sheet.id}`)
  })

  test('exercise: the owner page per owner kind', () => {
    expect(sourceHref(`exercise:${ex('topic').id}`)).toBe(`/topic/${ex('topic').ownerId}?tab=exercises`)
    expect(sourceHref(`exercise:${ex('topic-minitest').id}`)).toBe(`/topic/${ex('topic-minitest').ownerId}?tab=mini-test`)
    expect(sourceHref(`exercise:${ex('situation').id}`)).toBe(`/practice/situations/${ex('situation').ownerId}?tab=exercises`)
    expect(sourceHref(`exercise:${ex('reading').id}`)).toBe(`/practice/reading/${ex('reading').ownerId}#questions`)
    expect(sourceHref(`exercise:${ex('diagnostic').id}`)).toBe('/diagnostic')
  })

  test('nothing to open: unknown ids, manual, review, writing, unknown kind', () => {
    for (const k of ['vocab', 'situation', 'reading', 'topic', 'cheatsheet', 'exercise']) expect(sourceHref(`${k}:no-such-id:examples:1`)).toBeUndefined()
    for (const s of ['manual', 'manual:tutor', 'review:x', 'writing:x', 'bogus:x', '']) expect(sourceHref(s)).toBeUndefined()
  })
})

describe('wordHref: ids are URL-encoded', () => {
  test.each([
    ['saúde#noun', '/words/sa%C3%BAde%23noun'],
    ['u:pão de forma', '/words/u%3Ap%C3%A3o%20de%20forma'],
    ['u:d’água', '/words/u%3Ad%E2%80%99%C3%A1gua'],
    ['u:a/b?c&d=e%f', '/words/u%3Aa%2Fb%3Fc%26d%3De%25f'],
    ['levantar-se#verb', '/words/levantar-se%23verb'],
  ])('%s → %s', (id, href) => {
    expect(wordHref(id)).toBe(href)
    expect(decodeURIComponent(href.slice('/words/'.length))).toBe(id)
  })

  test('NFD and NFC ids give different hrefs (ids must be normalised before linking)', () => {
    const nfc = 'u:saúde'
    const nfd = nfc.normalize('NFD')
    expect(wordHref(nfc)).not.toBe(wordHref(nfd))
  })
})

describe('lookupAttrs', () => {
  test('src, ru and the lock tri-state', () => {
    expect(lookupAttrs({})).toEqual({})
    expect(lookupAttrs({ src: { kind: 'exercise', id: 'e1' }, locked: true })).toEqual({ 'data-pt-src': 'exercise:e1', 'data-lookup': 'off' })
    expect(lookupAttrs({ locked: false })).toEqual({ 'data-lookup': 'on' })
    expect(lookupAttrs({ ru: 'перевод', src: { kind: 'manual', id: '' } })).toEqual({ 'data-pt-src': 'manual', 'data-pt-ru': 'перевод' })
    expect(lookupAttrs({ ru: '' })).toEqual({})
  })
})
