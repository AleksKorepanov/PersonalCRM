# PersonalCRM — Codex 5.2 Starter (Backend + Frontend)

Этот репозиторий — минимальный рабочий скелет для разработки облачного сервиса **PersonalCRM** (с ассистентским доступом), строго по контрактам:
- `openapi/personalcrm_openapi_v1.yaml` (API контракт)
- `db/personalcrm_postgres_schema_draft.sql` (PostgreSQL схема)

## Быстрый старт (локально)

### 1) Предварительные требования
- Docker + Docker Compose
- Node.js 20+
- Python 3.12+

### 2) Запуск Postgres + Backend + Frontend

1. Скопируйте `.env.example` в `.env` и при необходимости отредактируйте.
2. Запустите:

```bash
docker compose up --build
```

Ожидаемые адреса:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- Postgres: `localhost:5432`

### 3) Миграции (инициализация схемы)

В контейнере backend выполните:

```bash
docker compose exec backend alembic upgrade head
```

### 4) Dev seed (пользователь/воркспейс)

Создайте dev-данные:

```bash
docker compose exec backend python -m app.scripts.seed_dev
```

Скрипт создаст:
- user: `owner@local.dev`
- workspace: `PersonalCRM Dev`

ID воркспейса и пользователя будут выведены в консоль.

### 5) Проверка API

Откройте:
- Health: `GET /health`
- OpenAPI (из файла контракта): `GET /openapi.yaml`

Для всех `/api/v1/*` эндпоинтов требуется `workspace_id` query param.

## Структура

- `backend/` — FastAPI + Alembic + Postgres
- `frontend/` — Vite + React + TypeScript
- `openapi/` — исходный OpenAPI контракт
- `db/` — исходный SQL контракт
- `.cursor/rules` — правила для Codex 5.2 (Cursor)

## Принципы разработки

1. **Contract-first**: сначала правим OpenAPI/SQL, потом код.
2. **Multi-tenant**: любые данные всегда scoped by `workspace_id`.
3. **Assistant access**: приватные поля и приватные записи должны редактироваться/читаться только при наличии прав.
4. **Soft delete**: удаление = заполнить `deleted_at`.

