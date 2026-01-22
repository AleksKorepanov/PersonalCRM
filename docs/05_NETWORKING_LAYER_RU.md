# PersonalCRM — Networking Layer (MVP, RU)

## 1) Источники данных (API)

### Контакты
- `GET /api/v1/contacts` — список, поиск, фильтры, сортировки.
- `GET /api/v1/contacts/{contact_id}` — карточка контакта.
- Поля, полезные для нетворкинга:
  - идентичность: `id`, `display_name`, `first_name`, `last_name`, `organization`, `job_title`
  - контекст: `tags`, `industries`, `competencies`, `met_context`
  - сила связи: `tie_strength`
  - системные: `created_at`, `updated_at`
  - кэш-поля: `last_interaction_at`, `next_touch_at` (если присутствуют)
  - приватность: `visibility` (данные могут быть редактированы/скрыты для assistant)

### Взаимодействия
- `GET /api/v1/contacts/{contact_id}/interactions` — таймлайн по контакту.
- `GET /api/v1/interactions/{interaction_id}` — деталь.
- Поля:
  - `occurred_at`, `type`, `summary`, `outcome`, `next_action`, `next_action_at`
  - `visibility` (может ограничивать доступ/поля)

### Напоминания
- `GET /api/v1/reminders` — список, фильтры `status`, `due_from`, `due_to`, `contact_id`
- `GET /api/v1/reminders/{reminder_id}` — деталь
- Поля:
  - `due_at`, `status`, `title`, `body`, `type`, `contact_id`

### Интродукции
- `GET /api/v1/introductions` — список, фильтры `status`, `contact_id`
- `GET /api/v1/introductions/{introduction_id}` — деталь
- Поля:
  - `status`, `requester_contact_id`, `introducer_contact_id`, `target_contact_id`
  - `sent_at`, `met_at`, `outcome`, `ask`

## 2) MVP-алгоритмы

### 2.1 Последнее касание (Last Touch)
**Определение:** максимум по `interactions.occurred_at` для конкретного контакта.

**Формула:**
```
last_touch(contact_id) = max(occurred_at) из interactions для contact_id
```

**Если взаимодействий нет:** `last_touch = null`.

### 2.2 Следующее касание (Next Touch)
**Определение:** ближайшее активное напоминание по `due_at`.

**Активное напоминание:** `status = open`.

**Формула:**
```
next_touch(contact_id) = min(due_at) из reminders
где contact_id = contact_id и status = open
```

**Если активных напоминаний нет:** `next_touch = null`.

### 2.3 Просрочено (Overdue)
**Определение (MVP):** контакт считается просроченным, если:
- `next_touch` уже в прошлом, **или**
- `last_touch` старше установленной каденции.

**Формула:**
```
overdue = (next_touch < now) OR (last_touch < now - cadence)
```

**Каденции (MVP по силе связи):**
- `close` → 14 дней
- `medium` → 30 дней
- `weak` → 90 дней

**Если `last_touch = null`:**
- считать просроченным, если контакт старше 7 дней с момента `created_at`.

## 3) UX-принципы и состояния

### 3.1 Прозрачность формул
- В карточке контакта показывать «Последнее касание», «Следующее касание», «Просрочено».
- В подсказке/tooltip показывать формулу и дату, по которой принято решение.

### 3.2 Состояния пустых данных
- Нет взаимодействий → показывать «Пока нет касаний».
- Нет активных напоминаний → показывать «Нет назначенных касаний».

### 3.3 Приватность
- `visibility=private` не отображается для assistant.
- `visibility=limited` — скрывать чувствительные поля, но поведенческие метрики (last/next touch) показывать.

### 3.4 Безопасность по данным
- Использовать только `workspace_id`-scope.
- Любые вычисления строятся на данных, доступных текущей роли.

## 4) Минимальная логика для UI
- В списке контактов добавить колонку «Следующее касание».
- В карточке контакта — блок «Networking» с:
  - `last_touch` (дата/тип последнего взаимодействия)
  - `next_touch` (ближайшее напоминание)
  - индикатор `overdue`

## 4.1 MVP-хранение уровня контакта (A/B/C)
- Так как в API нет отдельного поля уровня, используем теги:
  - `tier:A`, `tier:B`, `tier:C`
- В UI уровень читается из тегов, а при изменении пересохраняется массив тегов.
- Пример: `tags = ["investor", "tier:B"]`

## 4.2 Страница «Кого давно не трогали»
- Источник данных: `contacts` + `interactions` (last_touch).
- Формулы:
  - `last_touch = max(interactions.occurred_at)`
  - `next_due = last_touch + cadence`
  - `overdue`, если `next_due < сегодня`
- Сортировка: по степени просрочки (дней).
## 5) Ограничения MVP
- Не использовать внешние источники (email/календарь).
- Не менять OpenAPI/SQL.
- Пересчёт метрик — на основе уже доступных списков (contacts + interactions + reminders).
