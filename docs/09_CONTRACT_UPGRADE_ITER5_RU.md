## Предложение production‑grade контрактов (итерация 5)

Документ описывает предложенные изменения API/контрактов для «импорта, дедупликации, merge и поиска» в production‑режиме.
Изменения НЕ применяются автоматически. OpenAPI/SQL не меняются.

### 1) Официальные endpoints

#### 1.1 Импорт контактов
**Endpoint:** `POST /api/v1/contacts/import`  
**Тип:** multipart/form-data  
**Цель:** загрузка CSV, синхронный результат для небольших файлов.

**Запрос:**
- `file` (CSV, UTF‑8)
- `mode` (optional): `create_only | upsert` (default `create_only`)
- `delimiter` (optional): `, | ;` (если не указан — авто‑детект)

**Ответ:**
```
{
  "job_id": null,
  "imported": 120,
  "skipped": 3,
  "errors": [
    { "line": 12, "message": "Некорректный email" }
  ]
}
```

#### 1.2 Поиск дублей
**Endpoint:** `GET /api/v1/contacts/duplicates`  
**Параметры:**
- `limit` (default 50)
- `cursor` (optional)
- `min_similarity` (optional, default 0.6)
- `include_reasons` (optional, default true)

**Ответ:**
```
{
  "groups": [
    {
      "reason": "email",
      "primary_contact": { ... },
      "candidates": [ ... ]
    }
  ],
  "next_cursor": "..."
}
```

#### 1.3 Merge контактов
**Endpoint:** `POST /api/v1/contacts/{id}/merge`  
**Параметры пути:** `{id}` — primary_contact_id  
**Тело запроса:**
```
{
  "merge_contact_ids": ["...","..."],
  "strategy": "prefer_primary" 
}
```

**Ответ:**
```
{
  "primary_contact_id": "...",
  "merged_contact_ids": ["..."],
  "transferred": {
    "interactions": 12,
    "reminders": 4,
    "introductions": 1,
    "project_participants": 3
  }
}
```

#### 1.4 Глобальный поиск
**Endpoint:** `GET /api/v1/search`  
**Параметры:**
- `q` (min_length=2)
- `limit` (default 5, max 50)
- `types` (optional): `contacts,projects,introductions`

**Ответ:**
```
{
  "contacts": [ ... ],
  "projects": [ ... ],
  "introductions": [ ... ]
}
```

---

### 2) Async jobs для большого импорта

**Рекомендуется**, когда размер файла превышает лимиты синхронной обработки.

#### 2.1 Создание job
**Endpoint:** `POST /api/v1/jobs/contacts-import`  
**Тело:** файл CSV + параметры импорта  
**Ответ:**
```
{ "job_id": "uuid", "status": "queued" }
```

#### 2.2 Проверка статуса job
**Endpoint:** `GET /api/v1/jobs/{job_id}`  
**Ответ:**
```
{
  "job_id": "...",
  "status": "running|done|failed",
  "progress": { "processed": 1200, "total": 5000 },
  "result": { "imported": 4800, "skipped": 200, "errors": [...] }
}
```

#### 2.3 Идемпотентность
**Рекомендуемый ключ:** `Idempotency-Key` в заголовках.

---

### 3) Схемы ошибок (единый контракт)

**Формат ошибки (JSON):**
```
{
  "code": "VALIDATION_ERROR|NOT_FOUND|FORBIDDEN|CONFLICT|TOO_LARGE|RATE_LIMIT",
  "message": "Человекочитаемое сообщение",
  "details": { "errors": [ { "loc": ["body","field"], "msg": "..." } ] }
}
```

**Поведение:**
- 400/422 для ошибок валидации.
- 403 для недостатка прав.
- 404 для отсутствующих ресурсов (и скрытия private).
- 409 для конфликтов merge/дубликатов.
- 413 для превышения размера файла.
- 429 для превышения лимитов.

---

### 4) Лимиты и ограничения

**Импорт:**
- max file size: 10–50 MB (зависит от окружения).
- max rows per sync import: 5k (рекомендуемый предел).
- max errors returned: 200 (остальные агрегировать в “+N ошибок”).

**Поиск/дубли:**
- limit per page: 50.
- min query length: 2.

**Merge:**
- max merge_contact_ids: 20.

---

### 5) План внедрения

1) Согласовать финальные контракты и лимиты.
2) Обновить OpenAPI и добавить версии эндпойнтов (без breaking).
3) Добавить async jobs для импорта в прод‑окружении.
4) Обновить фронтенд на новые контракты и статус‑polling.
5) Добавить нагрузочные тесты и мониторинг импорта.
6) Включить новые endpoints флагом и постепенно раскатывать.

---

### 6) Плюсы
- Единый стабильный контракт для импорта/дедупликации/merge/поиска.
- Масштабируемость импорта (async jobs).
- Предсказуемые ошибки и лимиты.
- Меньше ручных операций, лучше UX.

### 7) Риски
- Усложнение инфраструктуры из‑за job‑системы.
- Необходимость миграции клиентов на новые endpoints.
- Риск долгих backfill/merge на больших данных.
- Требуются строгие лимиты и rate‑limits.
