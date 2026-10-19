/**
 * Page objects for e2e specs. Role/label selectors only (the app has no data-testid); extend here rather than
 * repeating selectors in specs. Workstreams C/D/E may ADD methods; keep existing signatures stable.
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** Router-relative path → URL relative to baseURL (which ends with /learning-portuguese/). */
export const rel = (path: string) => path.replace(/^\/+/, '')

export class App {
  readonly nav: Nav
  readonly exercise: ExerciseRunner
  readonly lookup: LookupCard
  readonly review: ReviewSession
  readonly page: Page
  constructor(page: Page) {
    this.page = page
    this.nav = new Nav(page)
    this.exercise = new ExerciseRunner(page)
    this.lookup = new LookupCard(page)
    this.review = new ReviewSession(page)
  }

  /** Opens a router path ('/', '/topic/a1-ser-estar?tab=exercises') and waits for <main>. */
  async goto(path = '/') {
    await this.page.goto(rel(path))
    await expect(this.main).toBeVisible()
  }

  get main(): Locator {
    return this.page.getByRole('main')
  }

  /** The page's h1 inside <main>. */
  get heading(): Locator {
    return this.main.getByRole('heading', { level: 1 })
  }

  /** Raw localStorage entries under the app prefix (debugging / persistence asserts). */
  async storage(prefix = 'ptpt:v1:'): Promise<Record<string, string>> {
    return this.page.evaluate((p) => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith(p))), prefix)
  }

  async storageJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.page.evaluate((k) => localStorage.getItem(k), key)
    return raw ? (JSON.parse(raw) as T) : null
  }
}

/** Main navigation: top bar (desktop) or bottom tab bar (phone) — both are «Основные разделы». */
export class Nav {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }
  get root(): Locator {
    return this.page.getByRole('navigation', { name: 'Основные разделы' })
  }
  /** Click a main section by its (desktop or short phone) label: Главная, Курс, Повторение/Карточки, Практика, Настройки. */
  async open(label: string | RegExp) {
    await this.root.getByRole('link', { name: label }).click()
  }
  /** The active item (aria-current="page"). */
  active(): Locator {
    return this.root.locator('[aria-current="page"]')
  }
}

/**
 * Exercise runner (lessons, mini-tests, situations, diagnostic). One task is visible at a time: a region named
 * after the task instruction, with a «Ваш ответ» text field / radiogroup / word bank / match columns.
 */
export class ExerciseRunner {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  /** The visible tab panel (topic/situation pages keep hidden panels mounted). */
  get panel(): Locator {
    return this.page.locator('[role="tabpanel"]:not([hidden]), main').first()
  }
  /** The current task card. */
  get task(): Locator {
    return this.panel.getByRole('region').first()
  }
  get answerField(): Locator {
    return this.task.getByRole('textbox', { name: /Ваш ответ/ }).first()
  }
  get checkButton(): Locator {
    return this.task.getByRole('button', { name: 'Проверить' })
  }
  get dontKnowButton(): Locator {
    return this.task.getByRole('button', { name: 'Не знаю' })
  }
  get nextButton(): Locator {
    return this.panel.getByRole('button', { name: /^(Дальше|Завершить)$/ })
  }
  /** «Пройдено N из M» progress list (desktop side panel). */
  progressList(): Locator {
    return this.page.getByRole('list', { name: /^Пройдено \d+ из \d+$/ })
  }

  /**
   * Types an answer and presses Enter. `keyboardOnly` (desktop: the runner autofocuses the field on fine pointers)
   * asserts the field already has focus; otherwise the field is tapped first (phones don't autofocus).
   */
  async typeAnswer(text: string, { keyboardOnly = false } = {}) {
    if (keyboardOnly) await expect(this.answerField).toBeFocused()
    else await this.answerField.click()
    await this.page.keyboard.type(text)
    await this.page.keyboard.press('Enter')
  }

  /** Verdict text shown after answering («Верно!» or the correction). */
  feedback(): Locator {
    return this.task.getByText(/^(Верно!|Почти|Неверно|Правильный ответ)/).first()
  }

  /** Picks option N (1-based) of a choice task with the digit key. */
  async chooseByKey(n: number) {
    await this.page.keyboard.press(String(n))
  }

  /** After answering: Enter → next task (focus is on «Дальше»). */
  async next({ keyboardOnly = false } = {}) {
    if (!keyboardOnly) return this.nextButton.click()
    await expect(this.nextButton).toBeFocused()
    // The runner ignores a keyboard «Дальше» within NEXT_GUARD_MS (250 ms) of answering (bounced Enter).
    await this.page.waitForTimeout(300)
    await this.page.keyboard.press('Enter')
  }
}

/** Word lookup card (popover on desktop, sheet on phones) opened by tapping/selecting a pt word or «Найти слово». */
export class LookupCard {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }
  get root(): Locator {
    return this.page.getByRole('dialog').last()
  }
  get searchButton(): Locator {
    return this.page.getByRole('button', { name: 'Найти слово' })
  }
  addButton(): Locator {
    return this.root.getByRole('button', { name: /Добавить|В словарь/ }).first()
  }
  async close() {
    await this.page.keyboard.press('Escape')
    await expect(this.root).toBeHidden()
  }
}

/** SRS review session (/review). */
export class ReviewSession {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }
  get tabs(): Locator {
    return this.page.getByRole('tablist', { name: 'Повторение' })
  }
  get emptyState(): Locator {
    return this.page.getByText('Карточек пока нет')
  }
  /** Rating buttons after revealing a card (Снова / Трудно / Хорошо / Легко). */
  rating(name: RegExp | string): Locator {
    return this.page.getByRole('button', { name })
  }
}
