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

4) Проверка:
```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/openapi.yaml | head
```

Подробные проверки: docs/02_ACCEPTANCE_TESTS_RU.md

