# Поток D — найденные дефекты (e2e, личный словарь)

Набор: `tests/e2e/local/dictionary/**` (+ `tests/helpers/d-dict.ts`, `tests/fixtures/d-words.ts`).
Запуск: `E2E_PORT=4322 E2E_OUT_DIR=.e2e/D-dist npx playwright test tests/e2e/local/dictionary --output=test-results/e2e-D`.
Каждый дефект закреплён тестом с `test.fail(…, 'BUG D-NN …')` (или `test.fixme` для плавающего D-05): когда баг починят,
тест станет «unexpectedly passed» — тогда снять пометку. Трейс/скриншот: прогнать тест без пометки
(`test.fail(false, …)`) — артефакты в `test-results/e2e-D/<тест>/` (`trace.zip`, `test-failed-1.png`).

| ID | Кратко | Сер. | Тест |
|---|---|---|---|
| D-01 | Шторка на телефоне: после закрытия фокус уходит на `<body>`, а не к реплике | P2 | `capture.spec.ts` › closing the sheet returns focus to the tapped line |
| D-02 | Первое открытие карточки с клавиатуры (лексикон ещё грузится) не переносит фокус в карточку | P2 | `capture.spec.ts` › keyboard: the first lookup of the session moves focus into the card |
| D-03 | WebKit (iPhone): тап по полосе «Перевести «…»» не срабатывает | P1 | `capture.spec.ts` › lookupOnTap off…; `lookup-content.spec.ts` › a selected expression of several words (mobile-webkit) |
| D-04 | Очень длинное слово расширяет шторку за пределы экрана (Chromium Android) | P3 | `lookup-content.spec.ts` › words with an apostrophe and very long words… (mobile-chromium) |
| D-05 | Фильтры /words: смена уровня сразу после «Все» иногда возвращает прежний `?status=` | P3 | `words-page.spec.ts` › changing the level right after «Все»… (`fixme`, плавающий) |
| D-06 | Слово, удалённое во время сессии повторения, оставляет «осиротевшую» карточку `lex:` после оценки | P2 | `learn-review.spec.ts` › a word deleted in another tab during the session… |
| D-07 | Карточка слова, открытая сразу после «Показать ответ», закрывается автопрокруткой сессии | P3 | `learn-review.spec.ts` › a lookup opened right after the reveal stays open |
| D-08 | Диагностика: после ответа поиск слов включается (`data-lookup="on"`), по документу — всегда выключен | P2 | `lock.spec.ts` › diagnostic: lookup stays off even after an answer |
| D-09 | WebKit: после «Удалить старые карточки слов» фокус не попадает на строку результата | P3 | `integrations.spec.ts` › Settings: legacy word cards… (mobile-webkit) |

---

## D-01 · Фокус не возвращается после закрытия шторки (телефон)

- **Шаги:** mobile-webkit / mobile-chromium → `/practice/situations/banco-conta` → тап по слову «documento» в реплике 3 → шторка → Esc (или крестик / свайп).
- **Ожидание (doc 1.4, «Доступность»):** фокус возвращается к источнику — реплике `#dlg-line-2`.
- **Факт:** `document.activeElement` — `<body>`; читатель экрана и клавиатура теряют место.
- **Причина (предп.):** `WordCaptureProvider.closeLookup()` переводит фокус на реплику, а затем при размонтировании
  `LookupSheet` вызывается `dialog.close()` (`src/features/words/capture/LookupSheet.tsx:22`) — нативный `<dialog>`
  восстанавливает фокус на элемент, бывший в фокусе до `showModal()` (`body`). Порядок надо поменять: закрыть `<dialog>`, затем фокусировать.
- **Серьёзность:** P2 (a11y).

## D-02 · Первое открытие с клавиатуры не фокусирует карточку

- **Шаги:** desktop → `/practice/situations/banco-conta` (свежая загрузка) → фокус на реплику (Tab) → Enter.
- **Ожидание:** «Если карточка открыта с клавиатуры, фокус уходит на первую кнопку» (doc 1.4).
- **Факт:** фокус остаётся на реплике; во второй раз (лексикон загружен) — работает.
- **Причина (предп.):** `src/features/words/capture/LookupPopover.tsx:61-65` — эффект ставит `focused.current = true` при
  первом позиционировании, когда в карточке скелетон и есть только «Закрыть» (исключён селектором); после загрузки лексикона
  повторной попытки нет. Ставить флаг только при успешном `focus()` или перезапускать эффект при смене содержимого.
- **Серьёзность:** P2 (a11y, клавиатурный путь).

## D-03 · WebKit: полоса «Перевести «…»» не реагирует на тап

- **Шаги:** mobile-webkit (iPhone 15) → `/practice/situations/banco-conta` → выделить «conta à ordem» → внизу полоса «Перевести «conta à ordem»» → тап.
- **Ожидание:** открывается шторка с карточкой.
- **Факт:** события `pointerdown/touchstart/pointerup/touchend` есть, `click` не приходит; карточка не открывается.
  В mobile-chromium работает.
- **Причина (предп.):** `onPointerDown={keep}` с `preventDefault()` (`src/features/words/capture/SelectionChip.tsx:43`)
  в WebKit гасит последующий `click` для touch. Варианты: открывать по `pointerup`/`touchend`, либо не вызывать
  `preventDefault` для `pointerType === 'touch'` (выделение сохраняет `user-select`/`touch-action`).
  Проверено в Playwright WebKit; стоит перепроверить на реальном iPhone.
- **Серьёзность:** P1 — на iPhone фразы (выражения из нескольких слов) нельзя перевести и сохранить.

## D-04 · Очень длинное слово распирает шторку (Chromium Android)

- **Шаги:** mobile-chromium (Pixel 7) → любой pt-текст с «pneumoultramicroscopicossilicovulcanoconiótico» → тап.
- **Ожидание:** заголовок и предложение переносятся внутри шторки (ширина ≤ вьюпорта).
- **Факт:** панель шторки шире экрана (≈ 538 px при 413 px), текст обрезан справа. Скриншот: [D/D-04-long-word-sheet.png](D/D-04-long-word-sheet.png).
- **Причина (предп.):** `.lookup-sheet-panel` (`src/index.css:732`) / содержимое без `min-width: 0` и `overflow-wrap: anywhere`
  у блока контекста (`LookupCard.tsx`, `Context`), `break-words` не ломает слово внутри flex-элемента с автошириной.
- **Серьёзность:** P3 (редкий контент, но кнопки уходят за экран).

## D-05 · /words: устаревшие параметры поиска при быстрой смене фильтров (плавающий)

- **Шаги:** `/words` (есть слово «на паузе») → чип «На паузе» → чип «Все» → сразу выбрать «Уровень: A2».
- **Ожидание:** `?level=A2`, статус «Все».
- **Факт:** в ~1 из 4 прогонов URL снова содержит `status=paused`, список отфильтрован по паузе.
- **Причина (предп.):** `setFilter` (`src/features/words/WordsPage.tsx:77`) — функциональный `setParams` с `replace`
  получает `searchParams` прошлого рендера, если следующий вызов приходит до перерисовки.
- **Серьёзность:** P3.

## D-06 · Удаление слова во время повторения оставляет карточку-сироту

- **Шаги:** вкладка 1 — `/review?deck=words` → «Начать» (карточка слова comprar). Вкладка 2 — `/words/comprar%23verb` → «Удалить из словаря».
  Вкладка 1 — «Показать ответ» → «Хорошо».
- **Ожидание:** слово и его карточки удалены; оценка не возвращает карточку.
- **Факт:** в `ptpt:v1:cards` снова `lex:comprar#verb:recognize` (с `wordId` удалённого слова) — она попадёт в повторение без слова.
- **Причина (предп.):** `ReviewSession.rate()` безусловно пишет `repo.upsertCards([updated])` (`src/features/srs/ReviewSession.tsx:104`).
  Для карточек со `wordId` стоит проверять, что слово ещё существует (или писать через `WordsStore`).
- **Серьёзность:** P2 (данные; то же при удалении на другом устройстве в режиме синхронизации).

## D-07 · Карточка слова закрывается автопрокруткой после «Показать ответ»

- **Шаги:** desktop, окно 1280×600 → повторение слова → «Показать ответ» → сразу (< 300 мс) клик по слову в примере.
- **Ожидание:** карточка открыта.
- **Факт:** карточка закрывается (или не успевает появиться): через 260 мс сессия делает `window.scrollBy`
  (`src/features/srs/ReviewSession.tsx:159`), а поповер закрывается на любую прокрутку страницы
  (`src/features/words/capture/LookupPopover.tsx:80`).
- **Серьёзность:** P3 (быстрый пользователь; то же после ответа в упражнении-карточке).

## D-08 · Диагностика разрешает поиск слова после ответа

- **Шаги:** `/diagnostic` → «Начать» → ответить на первое задание.
- **Ожидание (doc 1.3):** «Диагностика: `data-lookup="off"` всегда».
- **Факт:** контейнер задания получает `data-lookup="on"`, слова задания можно открыть (в т. ч. перевод вариантов).
- **Причина (предп.):** `DiagnosticPage.tsx:210` использует `ExerciseRunner`, который снимает блокировку после ответа
  (`src/features/exercises/ExerciseRunner.tsx:307`, `locked: !current`); у диагностики нет обёртки `data-lookup="off"`/пропа.
- **Серьёзность:** P2 (расходится с решением; подсказки в оценке уровня).

## D-09 · WebKit: фокус после очистки старых карточек

- **Шаги:** mobile-webkit → засеять карточки `w:*`, `g:*` → «Настройки» → «Удалить…» → «Удалить 2».
- **Ожидание:** фокус на строке «Старые карточки слов удалены: 2…» (так задумано, `SettingsPage.tsx:507`).
- **Факт:** в WebKit фокус не там (Chromium — ок); вероятно, закрытие `<dialog>` возвращает фокус на исчезнувшую кнопку после эффекта.
- **Серьёзность:** P3 (a11y).

---

## Наблюдения (без отдельного теста)

- **Дебаунс настроек 400 мс** (`SettingsPage.tsx:84`): при уходе со страницы полной перезагрузкой раньше 400 мс изменение теряется.
  Для «Видов карточек слова» это даёт рассинхрон: карточки уже приостановлены (пишутся сразу), а `wordModes` остался прежним.
  Тесты ждут записи в `localStorage` перед навигацией.
- **Поиск /words** сворачивает диакритику и в кириллице: «приторныи» находит «приторный» (й → и). Вероятно, ок.
- **Слово без карточек и без отметки** (например, засеянное) считается «Новым», но в «Учить новые» не попадает (нет карточки PT → RU).
- `page.clock.install()` останавливает таймеры приложения (дебаунсы, анимации): в `learn-review.spec.ts` после `install` вызывается `clock.resume()`.

## Нужные `data-testid` / роли (src не менялся)

- Ручка шторки (`LookupSheet.tsx`, `aria-hidden`) — сейчас `.lookup-sheet-panel > div`; удобно `data-testid="lookup-sheet-handle"`.
- Карточка слова: popover — `[role=dialog][data-lookup-ui]`, sheet — `dialog.lookup-sheet`; одинаковый `data-testid="lookup-card"` упростил бы селекторы.
- Пример на обороте карточки слова (`WordCardFace.tsx`) — без роли/подписи; выбирается по тексту.
