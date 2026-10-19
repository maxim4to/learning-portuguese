/**
 * Per-device progress (src/data/deviceProgress.ts): what «Сбросить весь прогресс» deletes and what it keeps in
 * localStorage / sessionStorage, plus the reset signal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_SETTINGS_KEY, clearDeviceProgress, emitProgressReset, onProgressReset } from '@/data/deviceProgress'
import { installStorage, installThrowingStorage, removeStorage, type MemoryStorage } from '../helpers/A-data-storage'

let ls: MemoryStorage
let ss: MemoryStorage

const LOCAL = {
  'ptpt:v1:theme': 'dark',
  'ptpt:v1:auth-user': '{"uid":"u1"}',
  'ptpt:v1:snap:u1': '{"v":1}',
  'ptpt:v1:snap:u2': '{"v":1}',
  'ptpt:v1:settings': '{"voice":"male"}',
  'ptpt:v1:progress': '{}',
  'ptpt:v1:cards': '{}',
  'ptpt:v1:errors': '[]',
  'ptpt:v1:words': '{}',
  'ptpt:v1:srs-new:2026-10-19': '3',
  'ptpt:v1:writing:no-cafe': 'Olá',
  'ptpt:v2:future': 'x',
  'other-app': 'x',
}
const SESSION = {
  'ptpt:v1:run:topic:a1:lesson': '{}',
  'ptpt:v1:diagnostic': '{}',
  'ptpt:v1:logged-errors': '[]',
  'ptpt:v1:snap:u1': 'odd but kept',
  'other-app': 'y',
}

beforeEach(() => {
  ;({ local: ls, session: ss } = installStorage())
  for (const [k, v] of Object.entries(LOCAL)) ls.setItem(k, v)
  for (const [k, v] of Object.entries(SESSION)) ss.setItem(k, v)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('clearDeviceProgress', () => {
  it('default: deletes progress keys, keeps theme, auth-user, every snapshot, settings and foreign keys', () => {
    clearDeviceProgress()
    expect(Object.keys(ls.dump()).sort()).toEqual(
      ['other-app', 'ptpt:v1:auth-user', 'ptpt:v1:settings', 'ptpt:v1:snap:u1', 'ptpt:v1:snap:u2', 'ptpt:v1:theme', 'ptpt:v2:future'].sort(),
    )
    expect(Object.keys(ss.dump()).sort()).toEqual(['other-app', 'ptpt:v1:snap:u1'])
    expect(LOCAL_SETTINGS_KEY).toBe('ptpt:v1:settings')
  })

  it('resetSettings: the local settings go too; theme still stays', () => {
    clearDeviceProgress({ resetSettings: true })
    expect(ls.getItem('ptpt:v1:settings')).toBeNull()
    expect(ls.getItem('ptpt:v1:theme')).toBe('dark')
    expect(ls.getItem('ptpt:v1:snap:u1')).not.toBeNull()
  })

  it('empty storage and repeated calls are fine', () => {
    ls.clear()
    ss.clear()
    clearDeviceProgress()
    clearDeviceProgress({ resetSettings: true })
    expect(ls.length + ss.length).toBe(0)
  })

  it('storage unavailable (absent, throwing getter, throwing key()) never throws', () => {
    ls.key = () => {
      throw new Error('broken')
    }
    expect(() => clearDeviceProgress()).not.toThrow()
    installThrowingStorage()
    expect(() => clearDeviceProgress()).not.toThrow()
    removeStorage()
    expect(() => clearDeviceProgress()).not.toThrow()
  })

  // BUG A-12: see docs/testing-bugs/A.md — `ptpt:v1:dialogue-show-ru` («показывать перевод» in situation dialogues,
  // src/features/situations/DialogueSection.tsx:15) is a per-device preference, but the KEEP list only has theme
  // and auth-user, so a progress reset silently turns the translation back on.
  it.fails('a progress reset keeps the dialogue «show translation» preference', () => {
    ls.setItem('ptpt:v1:dialogue-show-ru', '0')
    clearDeviceProgress()
    expect(ls.getItem('ptpt:v1:dialogue-show-ru')).toBe('0')
  })
})

describe('progress-reset signal', () => {
  it('notifies every subscriber; unsubscribe stops it', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onProgressReset(a)
    const offB = onProgressReset(b)
    emitProgressReset()
    offA()
    emitProgressReset()
    offB()
    emitProgressReset()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(2)
  })
})
