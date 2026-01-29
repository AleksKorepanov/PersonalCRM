## Предложение изменений контрактов (итерация 4)

Документ описывает потенциальные изменения API и БД для ускорения «Панели недели» и упрощения фронтенд‑логики.
Изменения НЕ применяются автоматически.

### 1) Новый endpoint агрегации

**Endpoint:** `GET /api/v1/network/weekly`

**Цель:** отдать агрегированные данные для «Панели недели» одним запросом, без N+1 по контактам и без клиентской агрегации.

**Предлагаемые параметры:**
- `workspace_id` (как и в других эндпойнтах).
- `since` (опционально, ISO datetime) — начало окна для метрик.
- `until` (опционально, ISO datetime) — конец окна для метрик.

**Предлагаемый ответ (пример структуры):**
```
{
  "metrics": {
    "interactions_7d": 12,
    "interactions_30d": 38,
    "new_contacts_30d": 5,
    "active_introductions": 3
  },
  "queue": {
    "overdue_contacts": [
      { "contact_id": "...", "overdue_days": 9, "last_touch_at": "...", "next_touch_at": "..." }
    ],
    "reminders_due_7d": [
      { "reminder_id": "...", "contact_id": "...", "due_at": "...", "title": "..." }
    ]
  }
}
```

**Примечание по RBAC/visibility:**
- Для `assistant` возвращать только контакты не `private`.
- Для `limited` — скрывать чувствительные поля по текущей политике редактирования.

### 2) Денормализация на уровне контактов

**Поля в `contacts`:**
- `last_touch_at` — последнее касание (макс. `interactions.occurred_at`).
- `next_touch_at` — ближайшее касание (минимум активного `reminders.due_at`).

**Цель:** ускорить выборку просрочек и «очереди действий», убрать агрегацию на фронте.

### 3) Миграции БД (предложение)

1) **Добавить колонки**
```
ALTER TABLE contacts
  ADD COLUMN last_touch_at timestamptz NULL,
  ADD COLUMN next_touch_at timestamptz NULL;
```

2) **Индекс для быстрых выборок**
```
CREATE INDEX IF NOT EXISTS idx_contacts_last_touch_at ON contacts (last_touch_at);
CREATE INDEX IF NOT EXISTS idx_contacts_next_touch_at ON contacts (next_touch_at);
```

3) **Backfill**
```
UPDATE contacts c
SET last_touch_at = i.last_touch
FROM (
  SELECT contact_id, MAX(occurred_at) AS last_touch
  FROM interactions
  WHERE deleted_at IS NULL
  GROUP BY contact_id
) i
WHERE c.id = i.contact_id;

UPDATE contacts c
SET next_touch_at = r.next_touch
FROM (
  SELECT contact_id, MIN(due_at) AS next_touch
  FROM reminders
  WHERE deleted_at IS NULL AND status = 'open'
  GROUP BY contact_id
) r
WHERE c.id = r.contact_id;
```

4) **Поддержка актуальности**
- Обновлять `last_touch_at` при `POST /interactions`.
- Обновлять `next_touch_at` при `POST/PATCH /reminders` (status/due_at).
- При `DELETE`/soft‑delete пересчитывать для затронутого контакта.

### 4) Ожидаемое влияние

**Плюсы**
- Меньше запросов с фронта, быстрее «Панель недели».
- Упрощение UI: меньше вычислений на клиенте.
- Прозрачнее SLA для метрик и очереди.

**Риски**
- Денормализация требует строгой синхронизации: риск рассинхронизации `last_touch_at` / `next_touch_at`.
- Новые индексы и пересчёты увеличат нагрузку на записи (write‑path).
- Потребуются миграции и backfill на существующих данных.
