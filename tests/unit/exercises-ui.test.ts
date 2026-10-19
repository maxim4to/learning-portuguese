/**
 * features/exercises: describe.ts (headings, expected answers, SRS fronts, gap filling), feedbackText.ts and the
 * DOM-light helpers of keyboard.ts (with tiny fakes — node env).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exerciseExpected, exerciseFront, exerciseHeading, fillGaps } from '@/features/exercises/describe'
import { feedbackSummary, feedbackTone } from '@/features/exercises/feedbackText'
import { FOCUS_ATTR, focusMark, focusPrimary, hasFinePointer, isImeEnter, isInHiddenPanel, noMods, revealIfOffscreen, rovingIndex } from '@/features/exercises/keyboard'
import { allKinds, answer, ex } from '../helpers/A-feat-fixtures'

describe('describe: exerciseHeading', () => {
  it('has a heading for every kind; transform uses its instruction, match its prompt', () => {
    const h = allKinds().map(exerciseHeading)
    expect(h).toEqual([
      'Вставьте пропущенное',
      'Выберите правильный вариант',
      'Поставьте во множественное число:',
      'Составьте предложение',
      'Переведите на португальский',
      'Послушайте и запишите',
      'Послушайте и выберите',
      'Соедините пары',
      'Послушайте и повторите вслух',
    ])
    expect(exerciseHeading(ex.match('m', { prompt: 'Глаголы' }))).toBe('Глаголы')
  })
})

describe('describe: exerciseExpected', () => {
  it('lists accepted answers per kind', () => {
    expect(allKinds().map(exerciseExpected)).toEqual([
      ['sou'],
      ['está'],
      ['os carros'],
      ['Eu sou professor.'],
      ['Estou cansado.', 'Estou cansada.'],
      ['Bom dia!'],
      ['спасибо'],
      ['casa — дом; carro — машина'],
      ['Muito prazer.'],
    ])
  })
})

describe('describe: exerciseFront', () => {
  it('builds the SRS card front for every kind', () => {
    expect(allKinds().map(exerciseFront)).toEqual([
      'Eu ___ de Lisboa.',
      'Ela ___ cansada.\n[é / está]',
      'Поставьте во множественное число:\no carro',
      'sou · eu · professor',
      'Я **устал**.',
      'Диктант: Bom dia!',
      'Выберите — «Obrigado»\n[спасибо / пожалуйста]',
      'Соедините пары',
      'Muito prazer.',
    ])
  })
  it('uses optional ru / prompt fields when present', () => {
    expect(exerciseFront(ex.fillGap('f', { ru: 'Я из Лиссабона' }))).toBe('Eu ___ de Lisboa.\n(Я из Лиссабона)')
    expect(exerciseFront(ex.orderWords('o', { ru: 'Я учитель' }))).toBe('Я учитель')
    expect(exerciseFront(ex.listenChoice('l', { prompt: 'Что значит' }))).toBe('Что значит — «Obrigado»\n[спасибо / пожалуйста]')
    expect(exerciseFront(ex.match('m', { prompt: 'Пары' }))).toBe('Пары')
    expect(exerciseFront(ex.speak('s', { ru: 'Очень приятно' }))).toBe('Очень приятно')
  })
})

describe('describe: fillGaps', () => {
  it('fills each ___ with its part of "a / b"', () => {
    expect(fillGaps('Eu ___ e tu ___.', 'sou / és')).toBe('Eu sou e tu és.')
    expect(fillGaps('Eu ___ e tu ___.', 'sou/és')).toBe('Eu sou e tu és.')
  })
  it('fewer parts than gaps → the last part repeats; no gaps → unchanged; long underscores count as one gap', () => {
    expect(fillGaps('___ e ___', 'x')).toBe('x e x')
    expect(fillGaps('sem lacunas', 'x')).toBe('sem lacunas')
    expect(fillGaps('a ______ b __ c', 'X')).toBe('a X b __ c')
  })
})

describe('feedbackText', () => {
  it('feedbackTone: skipped wins, then verdict', () => {
    expect(feedbackTone(answer('x', true))).toBe('correct')
    expect(feedbackTone(answer('x', false, { verdict: 'accents' }))).toBe('accents')
    expect(feedbackTone(answer('x', false))).toBe('wrong')
    expect(feedbackTone(answer('x', false, { skipped: true, verdict: 'wrong' }))).toBe('skipped')
    expect(feedbackTone(answer('x', true, { skipped: true, verdict: 'correct' }))).toBe('skipped')
  })
  it('feedbackSummary for every tone, lenient or strict', () => {
    const fg = ex.fillGap()
    expect(feedbackSummary(fg, answer('fg', true), false)).toBe('Верно!')
    expect(feedbackSummary(fg, answer('fg', true, { verdict: 'accents' }), true)).toBe('Верно, но проверьте акценты. Правильно: right')
    expect(feedbackSummary(fg, answer('fg', false, { verdict: 'accents' }), false)).toBe('Почти: ошибка в акцентах. Правильно: right')
    expect(feedbackSummary(fg, answer('fg', false), false)).toBe('Неверно. Правильно: right')
    expect(feedbackSummary(fg, answer('fg', false, { skipped: true }), false)).toBe('Ответ: Правильно: right')
  })
  it('match never repeats the pairs; skipped match points to the pairs', () => {
    const m = ex.match()
    expect(feedbackSummary(m, answer('mt', false), false)).toBe('Неверно.')
    expect(feedbackSummary(m, answer('mt', false, { skipped: true }), false)).toBe('Ответ: см. пары')
  })
  it('speak-shadow is self-graded', () => {
    const s = ex.speak()
    expect(feedbackSummary(s, answer('sp', true), false)).toBe('Отлично!')
    expect(feedbackSummary(s, answer('sp', false), true)).toBe('Потренируйтесь ещё.')
  })
})

describe('keyboard: pure helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rovingIndex: arrows wrap, Home/End, orientation flags, empty list', () => {
    expect(rovingIndex('ArrowDown', 0, 3)).toBe(1)
    expect(rovingIndex('ArrowRight', 2, 3)).toBe(0)
    expect(rovingIndex('ArrowUp', 0, 3)).toBe(2)
    expect(rovingIndex('ArrowLeft', 1, 3)).toBe(0)
    expect(rovingIndex('Home', 2, 3)).toBe(0)
    expect(rovingIndex('End', 0, 3)).toBe(2)
    expect(rovingIndex('Enter', 0, 3)).toBeNull()
    expect(rovingIndex('ArrowDown', 0, 0)).toBeNull()
    expect(rovingIndex('ArrowDown', 0, 3, { vertical: false })).toBeNull()
    expect(rovingIndex('ArrowLeft', 0, 3, { horizontal: false })).toBeNull()
    expect(rovingIndex('ArrowUp', 1, 3, { horizontal: false })).toBe(0)
  })
  it('noMods: Shift allowed, Ctrl / Meta / Alt not', () => {
    expect(noMods({ metaKey: false, ctrlKey: false, altKey: false })).toBe(true)
    expect(noMods({ metaKey: true, ctrlKey: false, altKey: false })).toBe(false)
    expect(noMods({ metaKey: false, ctrlKey: true, altKey: false })).toBe(false)
    expect(noMods({ metaKey: false, ctrlKey: false, altKey: true })).toBe(false)
  })
  it('isImeEnter: composing, keyCode 229, React synthetic wrapper', () => {
    const k = (p: Partial<KeyboardEvent>) => ({ isComposing: false, keyCode: 13, ...p }) as KeyboardEvent
    expect(isImeEnter(k({}))).toBe(false)
    expect(isImeEnter(k({ isComposing: true }))).toBe(true)
    expect(isImeEnter(k({ keyCode: 229 }))).toBe(true)
    expect(isImeEnter({ nativeEvent: k({ keyCode: 229 }) })).toBe(true)
    expect(isImeEnter({ nativeEvent: k({}) })).toBe(false)
  })
  it('isInHiddenPanel: null element or a [hidden] ancestor', () => {
    expect(isInHiddenPanel(null)).toBe(true)
    expect(isInHiddenPanel({ closest: () => null } as unknown as Element)).toBe(false)
    expect(isInHiddenPanel({ closest: (s: string) => (s === '[hidden]' ? {} : null) } as unknown as Element)).toBe(true)
  })
  it('hasFinePointer: no window, no matchMedia, coarse, fine', () => {
    expect(hasFinePointer()).toBe(false) // node: no window
    vi.stubGlobal('window', {})
    expect(hasFinePointer()).toBe(false)
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(hasFinePointer()).toBe(false)
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q === '(pointer: fine)' }) })
    expect(hasFinePointer()).toBe(true)
  })
  it('focusMark spreads the data attribute', () => {
    expect(focusMark).toEqual({ [FOCUS_ATTR]: '' })
    expect(FOCUS_ATTR).toBe('data-exercise-focus')
  })
})

describe('keyboard: focusPrimary / revealIfOffscreen (fake DOM)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function env({ innerHeight = 800, header = '64px', reduced = false } = {}) {
    const doc = { activeElement: null as unknown, documentElement: {} }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { innerHeight, matchMedia: () => ({ matches: reduced }) })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (p: string) => (p === '--header-h' ? header : '') }))
    return doc
  }
  function el(rect: { top: number; bottom: number }, opts: { focusable?: boolean; child?: unknown; focusWorks?: boolean } = {}) {
    const doc = globalThis.document as unknown as { activeElement: unknown }
    const e = {
      matches: vi.fn(() => opts.focusable ?? true),
      querySelector: vi.fn(() => opts.child ?? null),
      focus: vi.fn(function (this: unknown) {
        if (opts.focusWorks ?? true) doc.activeElement = e
      }),
      getBoundingClientRect: () => rect,
      scrollIntoView: vi.fn(),
    }
    return e
  }
  const root = (mark: unknown) => ({ querySelector: vi.fn(() => mark) }) as unknown as HTMLElement

  it('no root / no mark → false', () => {
    env()
    expect(focusPrimary(null)).toBe(false)
    expect(focusPrimary(root(null))).toBe(false)
  })
  it('focusable mark: focused without scroll, revealed only when off-screen', () => {
    env()
    const visible = el({ top: 100, bottom: 140 })
    expect(focusPrimary(root(visible))).toBe(true)
    expect(visible.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(visible.scrollIntoView).not.toHaveBeenCalled()

    const below = el({ top: 790, bottom: 830 })
    expect(focusPrimary(root(below))).toBe(true)
    expect(below.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
  })
  it('wrapper mark → its first focusable child; wrapper with none → false', () => {
    env()
    const child = el({ top: 10, bottom: 50 })
    const wrapper = el({ top: 0, bottom: 0 }, { focusable: false, child })
    expect(focusPrimary(root(wrapper))).toBe(true)
    expect(child.focus).toHaveBeenCalled()
    expect(focusPrimary(root(el({ top: 0, bottom: 0 }, { focusable: false })))).toBe(false)
  })
  it('focus that does not take (element hidden) → false, no scroll', () => {
    env()
    const e = el({ top: 2000, bottom: 2040 }, { focusWorks: false })
    expect(focusPrimary(root(e))).toBe(false)
    expect(e.scrollIntoView).not.toHaveBeenCalled()
  })
  it('revealIfOffscreen: under the sticky header; reduced motion → auto; missing --header-h → 0', () => {
    env({ reduced: true })
    const under = el({ top: 30, bottom: 70 })
    revealIfOffscreen(under as unknown as HTMLElement)
    expect(under.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })

    env({ header: '' })
    const top = el({ top: 30, bottom: 70 })
    revealIfOffscreen(top as unknown as HTMLElement)
    expect(top.scrollIntoView).not.toHaveBeenCalled()
  })
})
