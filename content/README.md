# Контент курса европейского португальского (pt-PT)

Весь учебный контент — статические JSON-файлы в этой папке. Они валидируются Zod-схемами из `src/content/schema.ts` (`npm run validate`) и собираются в бандл. Схемы строгие: лишний или опечатанный ключ — ошибка валидации.

Эталонные темы (образцы для генератора, написаны вручную):

- `grammar/a1-presente-indicativo-regulares.json`
- `grammar/a1-presente-irregulares.json`
- `grammar/a2-preterito-perfeito-simples.json`
- `grammar/a2-pronomes-cliticos-colocacao.json`
- `grammar/b1-presente-conjuntivo.json`
- `grammar/b1-futuro-conjuntivo.json`

При генерации новых тем ориентируйтесь на них по объёму, тону и структуре.

## Структура папки

```
content/
  syllabus.json          уровни → модули → темы (порядок изучения)
  diagnostic.json        диагностический тест (по 1–2 вопроса на каждую тему A1–B1)
  grammar/<topicId>.json грамматическая тема
  situations/ vocab/ reading/ cheatsheets/   — ситуации, словари, тексты, шпаргалки
```

## Идентификаторы

- Только `a-z`, `0-9`, `-` (kebab-case), **без диакритики**: `a2-pronomes-cliticos-colocacao`, а не `a2-clíticos`.
- Тема: префикс уровня + португальское название: `a1-...`, `a2-...`, `b1-...`, `b2-...`.
- Имя файла темы = `id` темы.
- Упражнения: `<topicId>-ex-01`, `<topicId>-ex-02`…; мини-тест: `<topicId>-mt-01`…; диагностика: `diag-001`…
- id упражнений уникальны во всём курсе. id после публикации не меняем — к ним привязан прогресс и SRS.

## syllabus.json

```json
{ "levels": [ { "level": "A1", "modules": [ { "id": "a1-basics", "title": "Основы", "topics": ["a1-artigos-genero-numero", "..."] } ] } ] }
```

- `level`: `A1 | A2 | B1 | B2`. `title` модуля — по-русски.
- В syllabus перечислены и темы, файлов которых ещё нет: это план для генератора.
- Поле `module` в файле темы обязано совпадать с id модуля, в котором тема стоит в syllabus.

## Файл темы `grammar/<topicId>.json`

| поле | тип | что внутри |
|---|---|---|
| `id` | string | id темы |
| `level` | Level | уровень |
| `module` | string | id модуля из syllabus |
| `title` | string | название по-русски |
| `titlePt` | string | название по-португальски |
| `requires` | string[] | id тем-предпосылок (должны существовать в syllabus) |
| `theory` | markdown (ru) | 300–600 слов, заголовки `##`, таблицы спряжений, примеры **жирным** |
| `ptVsBr` | markdown (ru), опц. | таблица «pt-PT \| pt-BR \| комментарий» + 1–2 фразы |
| `commonErrors` | markdown (ru), опц. | список: *ошибка* ✗ → **правильно** ✓ + пояснение; ошибки именно русскоязычных и «заражение» бразильскими материалами |
| `examples` | `{ pt, ru, audio: true }[]` | 3–5 (в эталонах — 5) естественных фраз из жизни в Португалии |
| `exercises` | Exercise[] | 18–22 упражнения, не меньше 5 разных типов |
| `miniTest` | Exercise[] | ровно 10 заданий, сводная проверка темы |

Рекомендуемое распределение для 20–22 упражнений: 6–9 `fill-gap`, 4–5 `choice`, 3 `transform`, 2 `order-words`, 2–3 `translate-ru-pt`, 1 `listen-type`, 0–1 `listen-choice`, 1 `match`. Упражнения идут от простого к сложному. В мини-тесте — 4 fill-gap, 3 choice, 1 transform, 1 translate, 1 listen-*.

В markdown внутри JSON не используйте обратные кавычки (`` ` ``); португальские формы выделяйте **жирным**, ошибочные — *курсивом* со значком ✗.

## Упражнения (Exercise)

Общие поля: `id`, `topicId`, необязательные `tags: string[]` и `explanation` (ru, показывается после ответа).

| type | поля | примечания |
|---|---|---|
| `fill-gap` | `prompt` (pt, с `___`), `answer: string[]`, `hint?` (ru), `ru?` (перевод фразы) | в `prompt` в скобках инфинитив: `Eu ___ (fazer) o jantar.` Желательно один пропуск; если два — ответ в виде `"sou / estou"` |
| `choice` | `prompt`, `options: string[]`, `correct` (индекс с 0), `explanation?` | 3–4 варианта; дистракторы правдоподобны и часто «бразильские» |
| `transform` | `prompt` (pt), `instruction` (ru), `answer: string[]` | все допустимые варианты, в т. ч. без местоимения-подлежащего |
| `order-words` | `words: string[]`, `answer: string` | `answer` = те же слова, что в `words`, через пробел (финальную точку можно не ставить, `?`/`,` можно приклеить к слову). Выбирайте фразы с **единственным** естественным порядком |
| `translate-ru-pt` | `ru`, `answer: string[]` | перечислите все разумные варианты: с подлежащим и без, синонимы (ligar/telefonar, perceber/compreender/entender, cá/aqui) |
| `listen-type` | `text`, `answer` (обычно `[text]`) | диктант, 4–9 слов |
| `listen-choice` | `text`, `prompt?`, `options`, `correct` | варианты — переводы на русский или похожие на слух фразы |
| `match` | `pairs: [{ left, right }]`, `prompt?` (ru) | 4–6 пар в правильном соответствии (UI перемешивает) |
| `speak-shadow` | `text`, `ru?` | повтор за диктором, не оценивается |

Проверка ответов (`src/engine/grading.ts`): регистр и пунктуация (`. , ! ? ; : …` и кавычки) игнорируются, **акценты значимы** (ответ без акцента засчитывается как «почти верно»), дефисы сохраняются (`chama-se` ≠ `chama se`). Поэтому в `answer` пишем правильную орфографию с акцентами и не дублируем варианты, отличающиеся только пунктуацией или регистром.

Правильный вариант в `choice`/`listen-choice` должен стоять на разных позициях — не ставьте его всегда первым или вторым.

## diagnostic.json

```json
{ "questions": [ { "id": "diag-001", "topicId": "a1-ser-estar", "level": "A1", "type": "choice", "prompt": "...", "options": ["..."], "correct": 1, "explanation": "..." } ] }
```

Любое упражнение + поле `level`. `topicId` — тема из syllabus, `level` — уровень этой темы. Каждый вопрос проверяет **самый показательный пункт** темы (если ответ неверный — тема «красная»). Преимущественно `choice` и `fill-gap`. Сейчас 70 вопросов, покрыты все темы A1–B1.

## Правила pt-PT (обязательны для всего португальского текста)

### Грамматика

- **Длительное действие — `estar a + infinitivo`**: *Estou a trabalhar*, *Passei a tarde a estudar*. Герундий (*estou trabalhando*) — только как неправильный вариант / в блоке ptVsBr.
- **Неформально — `tu`** + форма 2-го лица (*tu falas, queres, vens*). Вежливо — **o senhor / a senhora** + 3-е лицо или безличная форма без местоимения (*Fala inglês?*). `você` — нейтрально-вежливое, в лицо звучит суховато; в неформальных диалогах не использовать. Множественное — `vocês`. Форма `vós` в таблицах опускается (устар./регион.).
- **Клитики**: по умолчанию **ênclise** (*Chamo-me*, *Dá-me*, *Eu amo-te*, *Ele chama-se*); **próclise** только после «магнитов» (não, nunca, ninguém, já, ainda, também, só, sempre, talvez, вопросительные слова, que/se/quando/porque, todos/alguém); **mesóclise** в futuro/condicional (*dir-te-ei*, *far-se-ia*). Никогда не начинать фразу с клитики. Формы *comprá-lo*, *fazem-no*, *dá-mo*, *lho*. Дополнение «его/её» — *vi-o*, а не *vi ele*.
- **Прошедшее**: «сделал» — perfeito simples (*Já comi*), а **tenho feito** — только «в последнее время регулярно». Прош. вр. 1-го л. мн. ч. на -ar с акцентом: **falámos** (≠ falamos, наст.).
- **Предлоги движения**: *ir **a**/**para*** (*Vou ao cinema*), не *ir em*.
- **Притяжательные с артиклем**: *o meu carro, a minha casa*.
- **«Есть, имеется» — há**, не *tem*. **ter de** + inf. предпочтительнее *ter que*.
- **Porque é que...?** в вопросах; *porquê* в конце вопроса / отдельно.
- Вежливые просьбы: *Podia...?*, *Queria...*, *Gostava de...* (imperfeito в значении condicional) — характерно для pt-PT.

### Лексика (Португалия, а не Бразилия)

| pt-PT ✓ | pt-BR ✗ |
|---|---|
| pequeno-almoço | café da manhã |
| autocarro | ônibus |
| comboio | trem |
| elétrico | bonde |
| telemóvel | celular |
| casa de banho | banheiro |
| frigorífico | geladeira |
| sumo | suco |
| rapariga, miúdo/miúda | moça, garoto |
| equipa | time |
| ecrã | tela |
| utilizador | usuário |
| apanhar (o autocarro) | pegar (o ônibus) |
| perceber | entender (тоже есть в pt-PT, но *perceber* частотнее) |
| bilhete | passagem / ingresso |
| talho | açougue |
| fato | terno |
| camisola | suéter |
| rés-do-chão | térreo |
| cartão de cidadão, NIF, Finanças, câmara municipal | — (реалии Португалии) |

Реалии — португальские: города, имена (Inês, Joana, Rui, Duarte, Rita, Pedro), Finanças, CP, Metro de Lisboa, Santos Populares. Названия стран и городов — в португальской форме: *Moscovo* (не *Moscou*), *Rússia*.

### Орфография — Acordo Ortográfico 1990 в варианте Португалии

- Без непроизносимых согласных: *ação, ótimo, direção, atual, elétrico, receção* (бр. *recepção*), *Egito*. Произносимые согласные сохраняются: *facto* (бр. *fato*), *contacto* (бр. *contato*).
- *veem, leem, creem, deem* — без циркумфлекса; *têm, vêm* — с ним (мн. ч. от ter/vir).
- *pôr* (глагол) с ^, *por* (предлог) без; *pôde* (прош.) vs *pode* (наст.).
- В pt-PT сохраняются европейские ударения: *António, género, económico, académico, bebé, ténis, fenómeno* (в Бразилии — *Antônio, gênero, econômico*).
- *falámos/jantámos* (прош.) с акцентом; *dêmos* (presente do conjuntivo) — акцент допустим.
- Месяцы и дни недели — со строчной буквы: *agosto, segunda-feira*.

### Русский текст

- Объяснения — по-русски, кратко, без «воды»; португальские формы внутри русского текста — **жирным**.
- Перевод примеров — естественный русский, не подстрочник.
- В `commonErrors` — ошибки, типичные для русскоязычных: отсутствие артикля, лишние местоимения-подлежащие, ser/estar, будущее время после *quando/se*, «чтобы» → conjuntivo, предлоги по русской модели, а также бразилизмы из онлайн-материалов.

## Чек-лист перед коммитом новой темы

1. `npm run validate` проходит.
2. `module` совпадает с syllabus, все `requires` существуют.
3. 18–22 упражнения, ≥ 5 типов, мини-тест из 10; все id уникальны и по шаблону.
4. В правильных ответах нет герундия, *você* в неформальной речи, клитик в начале фразы, бразильской лексики и орфографии.
5. В `answer` перечислены все естественные варианты; в `order-words` порядок однозначен и `answer` состоит ровно из `words`.
6. Позиции правильных вариантов в `choice` разнообразны.
