# Português PT — личный тренажёр европейского португальского

Веб-приложение (PWA) для изучения **европейского** португальского (pt-PT) с объяснениями на русском:
грамматические темы A1–B2 с упражнениями и мини-тестами, ситуации и диалоги, словари, тексты для чтения,
интервальное повторение (FSRS), журнал ошибок и диагностический тест. Аудио — заранее сгенерированные mp3 (edge-tts).

Стек: Vite + React + TypeScript + Tailwind, контент — статические JSON в `content/`, прогресс — Firebase
(Firestore + вход через Google) или, если Firebase не настроен, `localStorage` браузера.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173/learning-portuguese/
npm run build      # сборка в dist/
npm run lint
```

Без файла `.env` приложение работает полностью локально (без входа, прогресс в браузере).
С заполненным `.env` (см. `.env.example`) — требуется вход через Google, прогресс синхронизируется между устройствами.

## Контент

Формат, правила pt-PT и требования к темам — в [content/README.md](content/README.md).
Новый контент пишется Claude-сабагентами в сессии Claude Code (без Anthropic API), затем проверяется:

```bash
npm run validate
```

Подробнее о скриптах — [scripts/README.md](scripts/README.md).

## Озвучка (TTS)

```bash
python3 -m pip install --user edge-tts   # один раз
npm run tts -- --dry-run                 # что будет озвучено
npm run tts                              # сгенерировать недостающие mp3 в public/audio/
```

## Деплой: GitHub Pages

Сайт: **https://mi-crafts.com/learning-portuguese/**

Хостинг — GitHub Pages (project site репозитория `maxim4to/learning-portuguese`). Каждый push в `main`
запускает workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (Actions → «Deploy to GitHub Pages»;
можно запустить и вручную — `workflow_dispatch`): `npm ci` → `npm run validate` → `npm run build` →
публикация `dist/` через `actions/upload-pages-artifact` + `actions/deploy-pages`. TTS в CI не запускается —
mp3 лежат в репозитории в `public/audio/`.

- **Источник Pages** — GitHub Actions (Settings → Pages → Build and deployment → Source: GitHub Actions).
  Pages для приватного репозитория требует платного плана GitHub (Pro); на бесплатном плане репозиторий
  должен быть публичным.
- **Секреты** (Settings → Secrets and variables → Actions): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` — те же значения, что в `.env`. Они попадают в собранный JS
  (это публичный web-конфиг Firebase, защита данных — в `firestore.rules`). Обновить из `.env`:
  `gh secret set VITE_FIREBASE_API_KEY --body "$(grep ^VITE_FIREBASE_API_KEY= .env | cut -d= -f2-)"` и т.д.
- **Домен.** Кастомный домен `mi-crafts.com` настроен в user-site репозитории `maxim4to/maxim4to.github.io`;
  все project sites этого аккаунта автоматически доступны на нём по пути `/<имя-репозитория>/`. В этом
  репозитории домен (CNAME) настраивать не нужно.
- **Базовый путь.** Приложение собирается с `base: '/learning-portuguese/'` (переопределяется переменной
  `VITE_BASE_PATH`); от него же берутся `basename` роутера, `scope`/`start_url` PWA-манифеста и пути service worker.
- **SPA-маршруты.** У GitHub Pages нет rewrites, поэтому при сборке `dist/index.html` копируется в `dist/404.html` —
  прямые ссылки вида `/learning-portuguese/topic/...` открывают приложение. Файл `.nojekyll` отключает Jekyll.

Проверить сборку локально под тем же путём:

```bash
npm run build && npx vite preview --base /learning-portuguese/   # http://localhost:4173/learning-portuguese/
```

## Firebase (Auth + Firestore, личный аккаунт, бесплатный тариф Spark)

Firebase используется только для входа (Google) и хранения прогресса (Firestore); Firebase Hosting не используется.
Проект Firebase: `learning-portuguese-de2f0` (прописан в `.firebaserc`), `.env` заполнен.
Доступ к данным в `firestore.rules` разрешён только одному Google-аккаунту — по подтверждённому email
(строка `ALLOWED_EMAIL`), и только к своему `users/{uid}`. Всё остальное закрыто.
Репозиторий публичный, поэтому в закоммиченном `firestore.rules` стоит плейсхолдер `REPLACE_WITH_YOUR_EMAIL`,
а настоящий email задаётся переменной `ALLOWED_EMAIL` в `.env` (см. `.env.example`). `npm run deploy`
(`scripts/deploy-rules.ts`) подставляет его в копию правил `.firebase/firestore.rules.generated` (не в git) и деплоит её.

Уже сделано:

- email владельца указан в `.env` (`ALLOWED_EMAIL`);
- база Firestore `(default)` создана (Native, регион `nam5`), правила и индексы задеплоены.

Осталось вручную (через консоль, CLI для этого нет):

1. **Включить вход через Google**: Firebase console → Authentication → «Get started» (если Authentication ещё
   не инициализирован) → Sign-in method → Google → Enable (указать support email) → Save.
2. **Разрешить домен сайта**: Firebase console → Authentication → Settings → Authorized domains → Add domain →
   `mi-crafts.com`. Без этого вход на сайте падает с ошибкой `auth/unauthorized-domain`.
   `localhost` нужен только для входа при локальной разработке (`npm run dev` с заполненным `.env`) — если локально
   не входите, его можно удалить. `learning-portuguese-de2f0.firebaseapp.com` удалять нельзя (через него идёт
   OAuth-редирект), `learning-portuguese-de2f0.web.app` больше не нужен.

Firebase CLI должен быть залогинен **личным** аккаунтом (не рабочим):

```bash
npx firebase login:list          # должен быть личный аккаунт
npx firebase logout && npx firebase login   # если залогинен другой
```

**Деплой правил и индексов** Firestore (например, после смены `ALLOWED_EMAIL` в `.env` или правок `firestore.rules`):

```bash
npm run deploy                   # подставляет ALLOWED_EMAIL из .env и делает firebase deploy --only firestore
```

Если вместо приложения показан экран «Нет доступа к данным» — проверьте, что вход выполнен аккаунтом из
`ALLOWED_EMAIL` в `.env` и правила задеплоены через `npm run deploy`. Не деплойте `npx firebase deploy` напрямую —
тогда на сервер уйдёт плейсхолдер и доступ закроется для всех.

Проверка правил локально (нужна Java 11+, логин не нужен):

```bash
npm run test:rules   # unit-тесты правил на эмуляторе Firestore
npm run emulators    # эмуляторы Firestore + Auth для ручной отладки
```

## Установка на iPhone (PWA)

1. Открыть **https://mi-crafts.com/learning-portuguese/** в **Safari**.
2. Кнопка «Поделиться» → «На экран „Домой“» → «Добавить».
3. Запустить с иконки на домашнем экране и войти через Google (в установленном приложении вход идёт через
   перенаправление на страницу Google и обратно — это нормально).

Уроки, упражнения и SRS работают офлайн; изменения прогресса синхронизируются при появлении сети.
Аудио кэшируется по мере прослушивания.
