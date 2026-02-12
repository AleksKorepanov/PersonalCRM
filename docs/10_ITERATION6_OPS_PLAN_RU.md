## Итерация 6 — «Интеграции + Автоматизация + Production readiness»

Цель: подготовить продукт к интеграциям с внешними источниками, повысить автоматизацию и обеспечить готовность к продакшену (наблюдаемость, безопасность, производительность, CI/CD).

---

## 1) Интеграции (MVP)

### 1.1 Календарь (Google/Microsoft)
- **MVP:** импорт событий за 30–90 дней, привязка к контактам по email/имени.
- **Сохранение:** взаимодействия типа `event` + пометка источника (system tag).
- **Конфликты:** дедупликация по `external_id` (event id).

### 1.2 Почта (Gmail/Outlook)
- **MVP:** импорт переписки (только метаданные + краткий summary).
- **Сохранение:** взаимодействия типа `message` с `channel=email`.
- **Конфиденциальность:** хранить только заголовки/фрагменты; тело — опционально.

### 1.3 Задачи (Todoist/Asana/Trello)
- **MVP:** импорт задач, связанных с контактами.
- **Сохранение:** напоминания `type=task` + ссылка на внешний объект.

---

## 2) Авто‑next actions и авто‑reminders

### 2.1 Next actions
- Вычислять на базе последнего взаимодействия + тега приоритета + статуса проекта.
- MVP‑логика:  
  - если нет взаимодействий за каденцию → предложить “Связаться”.
  - если есть незакрытые `reminders` → next action = ближайший reminder.

### 2.2 Авто‑reminders
- Генерация reminder при создании interaction по правилам (например, follow‑up через 7 дней).
- Настраиваемые шаблоны в UI (по роли/типу взаимодействия).

---

## 3) Наблюдаемость

### 3.1 Структурные логи
- Единый формат JSON: `timestamp`, `level`, `request_id`, `user_id`, `workspace_id`, `route`, `status`, `duration_ms`.
- Логи аудита — отдельный канал.

### 3.2 Метрики
- `http_requests_total`, `http_request_duration_ms` (p50/p95), `db_pool_active`, `import_jobs_active`.
- Экспорт через `/metrics` (Prometheus).

### 3.3 Health/Readiness
- `GET /health` (liveness).
- `GET /ready` (DB/Redis/Queue доступен).

---

## 4) Безопасность

### 4.1 Rate limiting
- Глобальный лимит + per‑user/workspace.
- Отдельные лимиты на /import, /search.

### 4.2 CORS
- Явный allowlist (prod), строгие методы/headers.

### 4.3 Secrets
- Хранение секретов в окружении/secret‑store.
- Запрет на логирование секретов и токенов.

---

## 5) Производительность

### 5.1 Пагинация везде
- Cursor‑pagination (created_at, id) во всех списках.

### 5.2 Индексы
- `contacts(search_tsv)`, `contacts(emails, phones)`, `interactions(contact_id, occurred_at)`.
- `reminders(due_at, status)`, `introductions(status, created_at)`.

### 5.3 Кеширование
- Read‑through кеш для `/search` и `/me`.
- TTL 1–5 минут, инвалидация по мутациям.

---

## 6) Release pipeline и окружения

### 6.1 Окружения
- `dev` → локальная разработка  
- `staging` → QA, тестовые интеграции  
- `prod` → боевые пользователи

### 6.2 Pipeline
- CI: lint + pytest + e2e smoke.
- CD: build + deploy + smoke + canary.

---

## Чек‑лист готовности (Iteration 6 Done)
- Интеграции календаря/почты/задач доступны в MVP.
- Авто‑next action работает и отображается в UI.
- Авто‑reminders создаются по правилам и логируются.
- Метрики и логи собираются, readiness/health endpoints стабильны.
- Rate limiting и CORS настроены для prod.
- Критичные индексы и пагинация внедрены.
- Release pipeline описан и успешно проходит.

---

## Команды проверки (текущие)
```bash
docker compose up --build -d
docker compose exec -T backend pytest -q
cd frontend && npm run check:ru
cd frontend && PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e -- tests/e2e/smoke/app.spec.ts
```
