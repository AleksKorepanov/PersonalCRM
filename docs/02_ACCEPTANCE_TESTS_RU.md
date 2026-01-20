# PersonalCRM — проверки и тесты (RU)

## 0) Проверка окружения
Из корня проекта:
```bash
ls -la docker-compose.yml
ls -la openapi/personalcrm_openapi_v1.yaml
ls -la db/personalcrm_postgres_schema_draft.sql
```

## 1) Запуск (dev)
```bash
docker compose up --build
```
Ожидаемо: 3 сервиса поднялись (postgres/backend/frontend) без фатальных ошибок.

## 2) Применение миграций
```bash
docker compose exec backend alembic upgrade head
```
Ожидаемо: `alembic` завершается с кодом 0.

## 3) Проверка базы (таблицы)
```bash
docker compose exec postgres psql -U personalcrm -d personalcrm -c "\\dt"
```
Ожидаемо: в списке есть `workspaces`, `contacts`, `interactions`, `introductions`, `reminders`, `projects` и др.

## 4) Smoke API
```bash
curl -s http://localhost:8000/health
curl -s http://localhost:8000/openapi.yaml | head
```
Ожидаемо: health возвращает ok, openapi.yaml отдаётся.

## 5) Автотесты backend
```bash
docker compose exec backend pytest -q
```
Ожидаемо: все тесты зелёные.

## 6) Проверка UI
Открыть в браузере:
- http://localhost:5173
Ожидаемо: интерфейс на русском языке (меню, кнопки, заголовки, подсказки).

## 7) Минимальные сценарии приемки (ручные)
1. Создать контакт, убедиться что он появился в списке.
2. Открыть контакт, добавить взаимодействие, проверить что оно появилось в таймлайне.
3. Создать напоминание со сроком, увидеть его в списке.
