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

## 8) RBAC/Privacy/Audit проверки
### 8.1 Роли (owner/assistant) и доступ
```bash
# получить workspace_id
WORKSPACE_ID=$(curl -sSf http://localhost:8000/api/v1/me | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));console.log(data.workspaces[0].workspace.id)")

# owner по умолчанию
curl -sSf "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}"

# assistant через заголовок X-Debug-Role (только dev)
curl -sSf -H "X-Debug-Role: assistant" "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}"
```
Ожидаемо: оба запроса отдают список контактов, но assistant не видит приватные записи.

### 8.2 Privacy (private/shared/limited)
```bash
# создать приватный контакт
curl -sSf -X POST "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Приватный","tie_strength":"medium","visibility":"private"}' >/dev/null

# создать ограниченный контакт
curl -sSf -X POST "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Ограниченный","tie_strength":"medium","visibility":"limited","shared_notes":"Секрет","private_notes":"Очень секретно"}' >/dev/null

# assistant пытается получить приватный контакт (ожидается 404)
PRIVATE_ID=$(curl -sSf "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));console.log((data.data||[]).find(x=>x.display_name==='Приватный')?.id||'')") || true
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Debug-Role: assistant" "http://localhost:8000/api/v1/contacts/${PRIVATE_ID}?workspace_id=${WORKSPACE_ID}"

# assistant получает ограниченный контакт, но без чувствительных полей
LIMITED_ID=$(curl -sSf "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));console.log((data.data||[]).find(x=>x.display_name==='Ограниченный')?.id||'')") || true
curl -sSf -H "X-Debug-Role: assistant" "http://localhost:8000/api/v1/contacts/${LIMITED_ID}?workspace_id=${WORKSPACE_ID}"
```
Ожидаемо: приватный контакт не найден (404), ограниченный контакт возвращается с обнулёнными чувствительными полями.

### 8.3 Audit (логирование create/update/delete)
```bash
# assistant создаёт interaction
CONTACT_ID=$(curl -sSf "http://localhost:8000/api/v1/contacts?workspace_id=${WORKSPACE_ID}" | node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync(0,'utf8'));console.log((data.data||[])[0]?.id||'')")
curl -sSf -X POST "http://localhost:8000/api/v1/contacts/${CONTACT_ID}/interactions?workspace_id=${WORKSPACE_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Debug-Role: assistant" \
  -d '{"type":"meeting","occurred_at":"2026-01-21T12:00:00Z","summary":"RBAC audit test"}' >/dev/null

# owner читает audit
curl -sSf "http://localhost:8000/api/v1/audit?workspace_id=${WORKSPACE_ID}&entity_type=interaction"
```
Ожидаемо: в audit есть запись о создании interaction, доступно только owner.

## 9) Ассистент: ежедневная работа
Сценарий:
1. Открыть список контактов как assistant.
2. Убедиться, что приватные контакты не видны.
3. Открыть контакт с visibility=limited — заметки и чувствительные поля скрыты.
4. Создать взаимодействие и напоминание — операции доступны.
5. Попробовать открыть страницу «Аудит» — доступ запрещён (403).

Ожидаемо:
- Контакты с visibility=private отсутствуют в списке и недоступны по прямой ссылке.
- В контакте с visibility=limited чувствительные поля скрыты.
- Ассистент не имеет доступа к аудиту.
