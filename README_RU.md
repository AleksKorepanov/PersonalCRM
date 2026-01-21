# PersonalCRM — запуск (RU)

## Быстрый старт
1) Скопируйте переменные окружения:
```bash
cp .env.example .env
```

2) Запустите контейнеры:
```bash
docker compose up --build
```

3) Примените миграции:
```bash
docker compose exec backend alembic upgrade head
```

4) Проверьте, что сервисы доступны:
```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/openapi.yaml | head
```

5) Проверьте наличие ключевых таблиц:
```bash
docker compose exec postgres psql -U personalcrm -d personalcrm -c "SELECT to_regclass('public.workspaces') AS workspaces, to_regclass('public.contacts') AS contacts, to_regclass('public.interactions') AS interactions, to_regclass('public.reminders') AS reminders, to_regclass('public.introductions') AS introductions;"
```

## Адреса
- Backend: http://localhost:8000
- Frontend: http://localhost:5173
- Postgres: localhost:5432

Подробные проверки: docs/02_ACCEPTANCE_TESTS_RU.md

