/**
 * OfflineBanner + UpdatePrompt (src/components/AppStatus.tsx) with a controllable `virtual:pwa-register/react`
 * fake (captures the callbacks UpdatePrompt passes to useRegisterSW) and a fake service-worker registration.
 * AppStatus measures «was a worker already waiting at load» at import time, so each test imports it fresh
 * (vi.resetModules) after setting up navigator.serviceWorker.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FakeWorker, flushPromises, installFakeSW, watchReloads, type FakeSW } from '../../helpers/B-ui-sw'

interface SWOpts {
  onNeedReload?(): void
  onNeedRefresh?(): void
  onRegisteredSW?(url: string, reg: unknown): void
}
const pwa = vi.hoisted(() => ({ opts: null as SWOpts | null, calls: 0 }))
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (opts: SWOpts) => {
    pwa.opts = opts
    pwa.calls++
    return { needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: vi.fn() }
  },
}))

let sw: FakeSW | undefined
let reloads: ReturnType<typeof watchReloads>

beforeEach(() => {
  vi.resetModules()
  pwa.opts = null
  reloads = watchReloads()
})
afterEach(() => {
  reloads.restore()
  sw?.restore()
  sw = undefined
  vi.useRealTimers()
})

let goTo: (p: string) => void = () => {}
function Nav() {
  const navigate = useNavigate()
  useEffect(() => {
    goTo = (p) => navigate(p)
  }, [navigate])
  return null
}

async function mountPrompt() {
  const { UpdatePrompt } = await import('@/components/AppStatus')
  const r = render(
    <MemoryRouter initialEntries={['/']}>
      <Nav />
      <UpdatePrompt />
    </MemoryRouter>,
  )
  expect(pwa.opts).not.toBeNull()
  return r
}

/** The user has interacted with the page: a later update is a mid-session one. */
const interact = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))

const needRefresh = async () => {
  await act(async () => {
    pwa.opts!.onNeedRefresh!()
    await flushPromises()
  })
}

describe('UpdatePrompt', () => {
  test('a worker already waiting at load is applied silently: SKIP_WAITING, no banner, reload on activation', async () => {
    const waiting = new FakeWorker('installed')
    sw = installFakeSW({ waiting })
    await mountPrompt()
    await needRefresh()
    await act(flushPromises)
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('pwa-update-reload-at')).toMatch(/^\d+$/)
    expect(reloads.count()).toBe(0)
    act(() => waiting.to('activated'))
    await act(flushPromises)
    expect(reloads.count()).toBe(1)
    // controllerchange after that does not reload a second time
    sw.controllerChange()
    expect(reloads.count()).toBe(1)
  })

  test('update found mid-session → banner; «Позже» hides it for the session', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    sw.reg!.waiting = new FakeWorker('installed')
    await needRefresh()
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Доступна новая версия приложения')
    fireEvent.click(screen.getByRole('button', { name: 'Позже' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('pwa-update-dismissed')).toBe('1')
    expect(sw.reg!.waiting!.postMessage).not.toHaveBeenCalled()
  })

  test('«Обновить» shows the pending state, sends SKIP_WAITING and reloads on controllerchange', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    const next = new FakeWorker('installed')
    sw.reg!.waiting = next
    await needRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    const btn = screen.getByRole('button', { name: 'Обновляем…' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Обновляем приложение…')
    expect(screen.queryByRole('button', { name: 'Позже' })).not.toBeInTheDocument()
    await act(flushPromises)
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    // A click does not count towards the auto-reload guard.
    expect(sessionStorage.getItem('pwa-update-reload-at')).toBeNull()
    sw.controllerChange()
    expect(reloads.count()).toBe(1)
  })

  test('«Обновить» waits for a newer version still downloading, then switches to it', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    const old = new FakeWorker('installed')
    sw.reg!.waiting = old
    await needRefresh()
    const newer = new FakeWorker('installing')
    sw.reg!.installing = newer
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    await act(flushPromises)
    expect(old.postMessage).not.toHaveBeenCalled()
    sw.reg!.waiting = newer
    sw.reg!.installing = null
    act(() => newer.to('installed'))
    await act(flushPromises)
    expect(newer.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  test('fallback: no activation / controllerchange within 4 s → hard reload anyway', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    const next = new FakeWorker('installed')
    sw.reg!.waiting = next
    await needRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    await act(flushPromises)
    expect(next.postMessage).toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(3999)
      await flushPromises()
    })
    expect(reloads.count()).toBe(0)
    await act(async () => {
      vi.advanceTimersByTime(1)
      await flushPromises()
    })
    expect(reloads.count()).toBe(1)
  })

  test('nothing waiting any more when clicked (another tab activated it) → plain reload', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    await needRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    await act(flushPromises)
    expect(reloads.count()).toBe(1)
  })

  test('reload-loop guard: an automatic reload in the last 30 s → banner instead of another silent reload', async () => {
    sessionStorage.setItem('pwa-update-reload-at', String(Date.now() - 1000))
    const waiting = new FakeWorker('installed')
    sw = installFakeSW({ waiting })
    await mountPrompt()
    await needRefresh()
    expect(screen.getByRole('status')).toHaveTextContent('Доступна новая версия')
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })

  test('a pending (dismissed) update is applied on the next page change', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    interact()
    const next = new FakeWorker('installed')
    sw.reg!.waiting = next
    await needRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'Позже' }))
    act(() => goTo('/syllabus'))
    await act(flushPromises)
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(sessionStorage.getItem('pwa-update-dismissed')).toBeNull()
  })

  test('another tab took over (onNeedReload) → banner, not a reload mid-lesson', async () => {
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    act(() => pwa.opts!.onNeedReload!())
    expect(screen.getByRole('status')).toHaveTextContent('Доступна новая версия')
    expect(reloads.count()).toBe(0)
  })

  test('onRegisteredSW: hourly update check and on visibilitychange (skipped offline / while installing)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    sw = installFakeSW({ waiting: null })
    await mountPrompt()
    const reg = sw.reg!
    pwa.opts!.onRegisteredSW!('/sw.js', undefined) // no registration: ignored
    pwa.opts!.onRegisteredSW!('/sw.js', reg)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(reg.update).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(reg.update).toHaveBeenCalledTimes(2) // jsdom: visibilityState 'visible'
    reg.installing = new FakeWorker('installing')
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(reg.update).toHaveBeenCalledTimes(2)
    reg.installing = null
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(reg.update).toHaveBeenCalledTimes(2)
    online.mockRestore()
  })
})

describe('OfflineBanner', () => {
  test('hidden online; offline/online events show and hide it; text depends on sync', async () => {
    const { OfflineBanner } = await import('@/components/AppStatus')
    const { rerender } = render(<OfflineBanner synced={false} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toHaveTextContent('Нет сети — всё работает, прогресс сохраняется на устройстве.')
    rerender(<OfflineBanner synced />)
    expect(screen.getByRole('status')).toHaveTextContent('прогресс сохранится и синхронизируется, когда связь вернётся')
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('starts offline when navigator.onLine is false', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { OfflineBanner } = await import('@/components/AppStatus')
    render(<OfflineBanner synced={false} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    spy.mockRestore()
  })
})
