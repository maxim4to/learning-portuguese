import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { Badge } from '@/components/Badge'
import { ButtonLink } from '@/components/Button'
import { Card, AzulejoCorner } from '@/components/Card'
import { Chip, ChipGroup } from '@/components/Chip'
import { cx, haptic, scrollBehavior } from '@/components/cx'
import { HalftoneSurface } from '@/components/DotGrid'
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from '@/components/EmptyState'
import { Halftone } from '@/components/Halftone'
import { Illustration } from '@/components/Illustration'
import { levelArt, situationArt, situationCrops } from '@/components/illustrations'
import { LessonHeader } from '@/components/LessonHeader'
import { AzulejoMark } from '@/components/Logo'
import { BackLink, PageHeader } from '@/components/PageHeader'
import { LevelBadge, StatusBadge } from '@/components/StatusBadge'
import { toneForPct } from '@/components/tones'

// No canvas package in jsdom: getContext would log «Not implemented»; DotGrid then uses its SVG fallback.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('EmptyState / ErrorState / skeletons', () => {
  test('EmptyState: title, text, action; art instead of the icon', () => {
    const { container, rerender } = render(<EmptyState icon={<svg data-icon />} title="Пусто" text="Ничего нет" action={<button>Добавить</button>} compact tone="sun" />)
    expect(screen.getByText('Пусто')).toBeInTheDocument()
    expect(screen.getByText('Ничего нет')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument()
    expect(container.querySelector('[data-icon]')).not.toBeNull()
    rerender(<EmptyState icon={<svg data-icon />} art="empty-errors" title="Ошибок нет" />)
    expect(container.querySelector('[data-icon]')).toBeNull()
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toMatch(/illustrations\/empty-errors-512\.webp$/)
    expect(img).toHaveAttribute('aria-hidden', 'true')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  test('ErrorState: alert with default text, detail and a working retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState detail="network" onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Не удалось загрузить данные')
    expect(alert).toHaveTextContent('network')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  test('PageSkeleton: a labelled status with N cards; Skeleton is decorative', () => {
    const { container } = render(<PageSkeleton cards={2} />)
    const s = screen.getByRole('status', { name: 'Загрузка' })
    expect(s.querySelectorAll('[aria-hidden]')).toHaveLength(3)
    render(<Skeleton className="h-4" />)
    expect(container.ownerDocument.querySelectorAll('.animate-pulse').length).toBeGreaterThan(3)
  })
})

describe('headers', () => {
  test('PageHeader: back link, h1 with lang, meta, subtitle, actions, children', () => {
    inRouter(
      <PageHeader back={{ to: '/x', label: 'Назад' }} title="Título" titleLang="pt-PT" meta={<span>A2</span>} subtitle="Подзаголовок" actions={<button>Действие</button>}>
        <p>Фильтры</p>
      </PageHeader>,
    )
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/x')
    expect(screen.getByRole('heading', { level: 1, name: 'Título' })).toHaveAttribute('lang', 'pt-PT')
    for (const t of ['A2', 'Подзаголовок', 'Фильтры']) expect(screen.getByText(t)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Действие' })).toBeInTheDocument()
  })

  test('BackLink and LessonHeader (back with title, level, h1, below line)', () => {
    inRouter(
      <>
        <BackLink to="/a" label="К списку" />
        <LessonHeader back={{ to: '/s', label: 'Ситуации', title: 'Практика · Ситуации' }} level="B1" title="В кафе" below={<span>No café</span>} icon={<i data-ic />} />
      </>,
    )
    expect(screen.getByRole('link', { name: 'К списку' })).toHaveAttribute('href', '/a')
    const back = screen.getByRole('link', { name: 'Ситуации' })
    expect(back).toHaveAttribute('title', 'Практика · Ситуации')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('В кафе')
    expect(screen.getByText('B1')).toBeInTheDocument()
    expect(screen.getByText('No café')).toBeInTheDocument()
  })
})

describe('badges, chips, buttons', () => {
  test('Badge with icon and title; StatusBadge labels; LevelBadge falls back to A1 tone', () => {
    render(
      <>
        <Badge icon={<svg />} title="подсказка" size="md" tone="danger">
          Ошибка
        </Badge>
        <StatusBadge status="confident" />
        <StatusBadge status="weak" />
        <StatusBadge status="learning" />
        <StatusBadge status="not-started" />
        <LevelBadge level="C2" />
      </>,
    )
    expect(screen.getByTitle('подсказка')).toHaveTextContent('Ошибка')
    for (const l of ['Уверенно', 'Слабо', 'Изучаю', 'Не начато']) expect(screen.getByText(l)).toBeInTheDocument()
    expect(screen.getByText('C2').className).toContain('bg-azulejo-soft')
  })

  test('Chip: aria-pressed toggle with a count, inside a labelled group', async () => {
    const onClick = vi.fn()
    render(
      <ChipGroup label="Уровень">
        <Chip pressed={false} count={3} muted onClick={onClick}>
          A2
        </Chip>
        <Chip pressed>Все</Chip>
      </ChipGroup>,
    )
    const group = screen.getByRole('group', { name: 'Уровень' })
    const [a2, all] = within(group).getAllByRole('button')
    expect(a2).toHaveAttribute('aria-pressed', 'false')
    expect(a2).toHaveTextContent('A23')
    expect(all).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(a2)
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('ButtonLink renders a link with variant classes and decorative icons', () => {
    inRouter(
      <ButtonLink to="/review" variant="secondary" size="sm" block icon={<svg />} iconEnd={<svg />}>
        Начать
      </ButtonLink>,
    )
    const link = screen.getByRole('link', { name: 'Начать' })
    expect(link).toHaveAttribute('href', '/review')
    expect(link.className).toContain('btn-secondary')
    expect(link.className).toContain('w-full')
    expect(link.querySelectorAll('[aria-hidden]')).toHaveLength(2)
  })
})

describe('cards and decorative art', () => {
  test('Card tones; hero adds the halftone corner (canvas unavailable in jsdom → SVG fallback)', () => {
    const { container } = render(
      <>
        <Card as="section" tone="sunken" aria-label="Сводка">
          Тело
        </Card>
        <Card tone="hero">Герой</Card>
        <AzulejoCorner size="sm" />
        <HalftoneSurface as="aside" dots={{ fallback: <i data-fb /> }}>
          x
        </HalftoneSurface>
      </>,
    )
    expect(screen.getByRole('region', { name: 'Сводка' }).className).toContain('card-sunken')
    const hero = screen.getByText('Герой')
    expect(hero).toHaveAttribute('data-halftone-surface')
    expect(hero.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('aside[data-halftone-surface] [data-fb]')).not.toBeNull()
  })

  test('Halftone draws one path; fades and seeds are deterministic', () => {
    const { container, rerender } = render(<Halftone seed={3} width={60} height={40} step={10} fade="left" />)
    const d1 = container.querySelector('path')!.getAttribute('d')
    expect(d1).toBeTruthy()
    rerender(<Halftone seed={3} width={60} height={40} step={10} fade="left" />)
    expect(container.querySelector('path')!.getAttribute('d')).toBe(d1)
    for (const fade of ['right', 'top', 'bottom'] as const) rerender(<Halftone seed={4} width={60} height={40} step={10} fade={fade} heat={0.9} />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  test('AzulejoMark: full glyph at 32px, simplified at ≤24px, always hidden from AT', () => {
    const { container, rerender } = render(<AzulejoMark />)
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 48 48')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<AzulejoMark size={20} />)
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 16 16')
  })

  test('Illustration: srcset of every width, alt makes it non-decorative, cover/eager', () => {
    const { container } = render(<Illustration name="hero" alt="Лиссабон" cover eager />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('alt', 'Лиссабон')
    expect(img).not.toHaveAttribute('aria-hidden')
    expect(img).toHaveAttribute('loading', 'eager')
    expect(img.getAttribute('srcset')!.split(', ')).toHaveLength(4)
    expect(img.className).toContain('object-cover')
  })

  test('illustration helpers: level art, situation groups, per-group crops', () => {
    expect(levelArt('B2')).toBe('level-b2')
    expect(situationArt('farmacia')).toBe('sit-health')
    expect(situationArt('no-cafe')).toBe('sit-food')
    expect(situationArt('zzz')).toBe('sit-food')
    const crops = situationCrops(['farmacia', 'ginasio', 'no-cafe'])
    expect(crops.get('farmacia')!.transform).toBe('scale(1)')
    expect(crops.get('ginasio')!.transform).toBe('scale(1.9)')
    expect(crops.get('no-cafe')!.transform).toBe('scale(1)')
  })
})

describe('small helpers', () => {
  test('cx, toneForPct, scrollBehavior, haptic', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
    expect([toneForPct(90), toneForPct(60), toneForPct(59)]).toEqual(['brand', 'sun', 'terracotta'])
    expect(scrollBehavior()).toBe('smooth')
    const vib = vi.spyOn(navigator, 'vibrate')
    haptic(20)
    expect(vib).toHaveBeenCalledWith(20)
    const mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    expect(scrollBehavior()).toBe('auto')
    haptic()
    expect(vib).toHaveBeenCalledTimes(1)
    mm.mockRestore()
  })
})
