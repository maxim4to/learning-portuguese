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

## Лексикон (`content/lexicon/`)

Словарь приложения для карточки слова (тап по слову, поиск, «Мой словарь»). Источник истины — JSON-файлы здесь; приложение получает скомпилированный `src/generated/lexicon.json` (ленивый чанк). Схема — `LexEntrySchema` в `src/content/schema.ts`. Подробности проекта — `docs/personal-dictionary.md`, раздел 2.

**Правило проекта: содержимое лексикона пишут люди/агенты сами.** Никаких LLM/переводческих API, скриптов с ключами, дампов Викисловаря.

### Команды

| команда | что делает |
|---|---|
| `npm run lexicon` | `build` + `extract` + `report` |
| `npm run lexicon -- build` | собирает бандл: каждая лемма разворачивается морфологией (спряжение, мн. ч., ж. р.), в индекс попадают формы, встреченные в корпусе курса. Проверяет схему, дубликаты id, `conj`, бразилизмы, место записи, размер (> 1 МБ — ошибка) |
| `npm run lexicon -- extract` | пишет `_todo.json`: все формы корпуса, которые лексикон не разбирает, сгруппированные по **предполагаемой** лемме |
| `npm run lexicon -- report` | покрытие (уникальные формы и словоупотребления), неоднозначные формы, топ неразобранных |
| `npm run lexicon -- todo d-i --limit 50` | компактный список задач своего среза |
| `npm run lexicon -- format` | сортирует записи и раскладывает по каноническим файлам. **Только координатор**, не агенты-наполнители |

После правок: `npm run lexicon` → `npm run validate` → `npm run test:unit` (тест «бандл не устарел» требует свежего `build`).

### Файлы и параллельная работа

| файл | что внутри |
|---|---|
| `function.json` | служебные слова: артикли, предлоги, местоимения (в т. ч. клитики), союзы, числительные, определители + частые наречия и междометия. Владелец — координатор |
| `verbs-<срез>.json` | глаголы (`pos: verb`), включая возвратные (`levantar-se`) и глагольные выражения (`ter de`, `valer a pena`) |
| `nouns-<срез>.json` | существительные (`pos: noun`), включая составные (`casa de banho`) и имена собственные (`Lisboa`, `Inês`) |
| `words-<срез>.json` | прилагательные, наречия, междометия, фразы (`adj`, `adv`, `interj`, `phrase`) |
| `_todo.json` | генерируется `extract`, руками не править |
| `_ignore.json` | формы корпуса, которые не являются словами (буквы вариантов ответа, размеры M/XL, значки º/ª) — с причиной |

Срез — диапазон первой буквы леммы (без диакритики): `a-c`, `d-i`, `j-p`, `q-z` (задаются в `scripts/lexicon/layout.ts`). **Один агент = один срез**: он правит только `verbs-<срез>`, `nouns-<срез>`, `words-<срез>`. Файл записи определяется леммой и частью речи; запись не в своём файле — предупреждение `build` (а `format` перенесёт её в чужой файл — поэтому не запускайте его). `src/generated/lexicon.json` и `_todo.json` — генерируемые: при слиянии параллельной работы их не сливают, а пересобирают (`npm run lexicon`).

### Как работать по `_todo.json`

```json
{"lemma":"ajudar","pos":"verb","slice":"a-c","file":"verbs-a-c.json","count":106,
 "forms":{"ajudar":37,"ajuda":34,"ajudado":23},"examples":[{"text":"…","src":"/content/…#dialogue[3].pt"}]}
```

- `lemma`, `pos` — догадка по окончаниям и частоте форм. **Проверяйте**: `casa` предложена как форма `casar` — на самом деле нужна и `casa` (сущ.), см. `alt`. `pos: "?"` — решите сами, `"name"` — имя собственное (в `nouns-*`).
- `known: true` — лемма уже есть, а формы не сгенерировались: допишите форму в `forms`, исправьте `conj` или таблицу в `scripts/lexicon/irregular.ts` (последнее — координатору).
- `count` — употребления в упражнениях, диалогах, текстах (главная цель: 100 %); `md` — только во фрагментах теории и шпаргалок (ниже приоритет).
- Добавили леммы → `npm run lexicon` → их формы исчезают из `_todo.json`. Не добавляйте формы, которые генерируются сами (спряжение, регулярные мн. ч. и ж. р.).

### Формат записи

Одна запись — одна строка, ключи в порядке: `lemma, pos, sense, ru, gender, plural, fem, conj, reflexive, forms, level, br, note`.

```json
{"lemma":"autocarro","pos":"noun","ru":["автобус"],"gender":"m","level":"A1","br":"ônibus"}
{"lemma":"pão","pos":"noun","ru":["хлеб","булочка"],"gender":"m","level":"A1"}
{"lemma":"vizinho","pos":"noun","ru":["сосед"],"gender":"mf","level":"A1"}
{"lemma":"levantar-se","pos":"verb","ru":["вставать"],"reflexive":true,"level":"A1"}
{"lemma":"despir","pos":"verb","ru":["раздевать"],"level":"B1"}
{"lemma":"de vez em quando","pos":"adv","ru":["время от времени"],"level":"A2"}
```

| поле | правило |
|---|---|
| `lemma` | словарная форма **без артикля**: инфинитив, м. р. ед. ч. (`cansado`), имя собственное с заглавной. pt-PT орфография (AO90 в варианте Португалии: `ação`, `facto`, `receção`, `António`) |
| `pos` | `noun verb adj adv prep pron det conj num interj phrase` |
| `ru` | значения по-русски, частотное первым, коротко; пояснение в скобках: `"сдавать (экзамен)"`. Можно пример-конструкцию: `"ter de + inf. — быть должным"` |
| `gender` | у существительных обязательно: `m`, `f`, `mf` (один корень на оба рода: `o/a estudante`, `vizinho/vizinha` — ж. р. сгенерируется) |
| `plural` | **только нерегулярное** мн. ч. Правила уже знают: `-ão → -ões` (по умолчанию), списки на `-ães` (`pão, cão, alemão…`) и `-ãos` (`mão, irmão, cidadão, órgão…`), `-l → -is/-éis/-óis/-eis`, `-m → -ns`, `-r/-z → -es`, `mês → meses`, неизменяемые на `-s` (`lápis, ténis, férias`). Нестандартное `-ão` не из списков — укажите `plural`. Неизменяемое слово — `"plural"` = сама лемма |
| `fem` | **только нерегулярный** ж. р. (`ator → atriz`, `ladrão → ladra`, `-ão → -ona`). Регулярные `-o → -a`, `-or → -ora`, `-ês → -esa`, `-ão → -ã`, `-eu → -eia` генерируются; `alegre, feliz, fácil, melhor` — неизменяемы |
| `conj` | глагол: обычно не нужно (см. ниже). `"reg"` — отключить чередования; имя таблицы (`"ter"`) — спрягать как производный от неё; класс (`"sentir"`, `"dormir"`, `"subir"`, `"odiar"`, `"agredir"`, `"passear"`, `"sair"`, `"incluir"`, `"roer"`, `"produzir"`) |
| `reflexive` | `true` для `-se` глаголов |
| `forms` | явные формы, которые правила не дают: варианты (`oiço`), уменьшительные (`cafezinho`), сокращения (`Sr.`), формы с клитикой из глоссариев |
| `level` | `A1…B2` — где слово впервые нужно |
| `br` | pt-BR вариант, если отличается (`ônibus`, `trem`, `celular`). Бразильские слова **никогда** не ставятся в `lemma`/`forms` (линтер бразилизмов — ошибка `build`); вместо этого `br` у португальской леммы — тогда тап по `ônibus` в упражнении покажет «бразильский вариант; в Португалии — autocarro» |
| `note` | короткая пометка по-русски: «разг.», «только pt-PT», «книжн.» |

### Глаголы

- Лемма — инфинитив. Регулярные `-ar/-er/-ir` спрягаются полностью: все времена, `-ámos` в perfeito (`falámos` ≠ `falamos`), futuro/presente/imperfeito do conjuntivo, imperativo, infinitivo pessoal, gerúndio, particípio с родом и числом.
- Автоматически: орфография `-car/-gar/-çar/-cer/-ger/-gir/-guir/-guer`; `e → i` и `o → u` у `-ir` (`sentir → sinto`, `dormir → durmo`, `seguir → sigo`, `cobrir → cubro`); `-ear` (`passeio`); `-air` (`saio, saímos`); `-uir` (`incluis, inclui`); `-oer` (`rói`); `-uzir` (`produz`).
- Неправильные (`ser, estar, ter, haver, ir, vir, fazer, dizer, poder, querer, saber, caber, ver, dar, pôr, trazer, ler, crer, ouvir, pedir, medir, valer, perder, rir, construir, destruir, requerer, reunir, proibir, saudar…`) — таблицы в `scripts/lexicon/irregular.ts`. Производные спрягаются сами: всё на `-por, -fazer, -dizer, -trazer, -pedir`; списки `manter/obter/conter/deter…`, `convir/intervir…`, `prever/rever…`, `sorrir`. Нет в списках — `"conj": "ter"` (лемма должна оканчиваться на базовый глагол).
- Списки-исключения: `odiar`-тип (`ansiar, remediar, incendiar, mediar`), `subir`-тип (`fugir, sacudir, acudir, cuspir, consumir, sumir, entupir`), `agredir`-тип (`prevenir, progredir, transgredir`). Двойные причастия (`aceite, entregue, pago, ganho, gasto, morto, preso, impresso…`) — `PARTICIPLES` там же; `-screver → -scrito`, `-cobrir → -coberto`, `-abrir → -aberto` — автоматически.
- Возвратный: `levantar-se` + `"reflexive": true`. Формы с клитиками (`levanto-me`, `fazê-lo`, `dir-lhe-ei`, `vê-los`) разбираются при поиске — их **не** вписывают в `forms`.
- Если и с `conj` форма не получается — впишите её в `forms` и сообщите координатору (нужна правка таблицы).

### Омографы и неоднозначность

- Разные части речи — разные записи с одной леммой: `como` (`adv` «как») и `como` (`conj`); форма `como` глагола `comer` появится сама. Порядок разборов в карточке выбирает контекст (`eu como` → `comer`).
- Одна часть речи, но разные слова (разный род/мн. ч./этимология) — вторая запись с `"sense": 2` (`capital` м. р. «капитал» / ж. р. «столица»). Близкие значения — просто несколько строк в `ru`.
- id записи = `lemma#pos[#sense]`; на него ссылаются слова пользователей (`WordEntry.lexId`). **Не переименовывайте и не меняйте `pos` у существующих записей** — только добавляйте.

### Выражения (MWE)

- Лемма с пробелами: `ter de`, `de vez em quando`, `casa de banho`, `pequeno-almoço` (дефисное слово — одно слово). Карточка находит самое длинное совпадение вокруг тапнутого слова.
- Первое слово изменяется само: `ter de` → `tenho de, tive de…`; `casa de banho` → `casas de banho`; `farto de` → `farta de`.
- `pos`: по функции (`verb`, `noun`, `adv`, `prep`, `conj`); целые реплики-клише — `phrase`. Не добавляйте свободные сочетания (`comprar pão`) — только устойчивые.

### Чек-лист агента-наполнителя

1. Работайте только в файлах своего среза; не трогайте `function.json`, `_todo.json`, `src/generated/`.
2. Берите задачи из `npm run lexicon -- todo <срез>` сверху вниз (частотные первыми).
3. Проверьте лемму и часть речи по примерам; переведите естественно, частотное значение первым.
4. pt-PT: лексика и орфография Португалии; бразильский вариант — только в `br`.
5. `npm run lexicon` (ошибок нет, формы ушли из `_todo.json`) → `npm run validate` → `npm run test:unit`.
