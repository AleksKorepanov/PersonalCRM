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
- Mock CardDAV: http://localhost:8080

## Проверка русификации интерфейса
```bash
cd frontend
npm run check:ru
```

## E2E тесты (Playwright)
```bash
cd frontend
npm run test:e2e
```

Отчёт:
```bash
cd frontend
npm run test:e2e:report
```

Подробные проверки: docs/02_ACCEPTANCE_TESTS_RU.md

## Mock CardDAV сервер

Для разработки и тестирования доступен mock CardDAV сервер, который эмулирует iCloud CardDAV API.

### Запуск mock сервера

Mock сервер запускается автоматически при `docker compose up --build`. Он доступен по адресу:
- **URL**: http://localhost:8080
- **Health check**: http://localhost:8080/health

### Конфигурация

Настройки iCloud/CardDAV находятся в `.env` файле:

```bash
# Режим работы: "mock" или "real"
ICLOUD_MODE=mock

# URL mock CardDAV сервера (используется когда ICLOUD_MODE=mock)
MOCK_ICLOUD_URL=http://mock-carddav:8080
```

### Данные mock сервера

Данные хранятся в директории `mock-carddav-data/carddavhome/` на хосте и монтируются в контейнер.
Это обеспечивает детерминированность тестов — данные сохраняются между перезапусками.

Предустановленные тестовые контакты:
- `sample-contact.vcf` — русскоязычный контакт
- `john-doe.vcf` — англоязычный контакт

### Ручная синхронизация с mock сервером

Для тестирования синхронизации можно использовать Python скрипт:

```python
from app.integrations.icloud.carddav_client import CardDAVClient

# Подключение к mock серверу
with CardDAVClient(
    username="test@example.com",
    password="test-password"
) as client:
    # Discovery
    carddav_path = client.discover()
    print(f"CardDAV path: {carddav_path}")
    
    # Список адресных книг
    addressbooks = client.list_addressbooks(carddav_path)
    print(f"Addressbooks: {addressbooks}")
    
    # Получение контакта
    etag, vcard = client.fetch_contact("sample-contact.vcf", carddav_path)
    print(f"Contact ETag: {etag}")
    print(f"Contact vCard:\n{vcard}")
    
    # Создание нового контакта
    new_vcard = """BEGIN:VCARD
VERSION:3.0
FN:Test Contact
TEL;TYPE=CELL:+79999999999
EMAIL:test@example.com
END:VCARD"""
    
    uri, etag = client.create_contact(new_vcard, "test-contact.vcf", carddav_path)
    print(f"Created contact: {uri}, ETag: {etag}")
```

Или через curl:

```bash
# Discovery
curl -X PROPFIND \
  -u "test@example.com:test-password" \
  -H "Depth: 0" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' \
  http://localhost:8080/.well-known/carddav

# Список контактов
curl -X PROPFIND \
  -u "test@example.com:test-password" \
  -H "Depth: 1" \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' \
  http://localhost:8080/carddavhome/

# Получение контакта
curl -u "test@example.com:test-password" \
  http://localhost:8080/carddavhome/sample-contact.vcf

# Создание контакта
curl -X PUT \
  -u "test@example.com:test-password" \
  -H "Content-Type: text/vcard; charset=utf-8" \
  -d "BEGIN:VCARD
VERSION:3.0
FN:New Contact
TEL:+79998887766
END:VCARD" \
  http://localhost:8080/carddavhome/new-contact.vcf
```

### Переключение между mock и реальным iCloud

1. **Использование mock сервера** (по умолчанию для разработки):
   ```bash
   ICLOUD_MODE=mock
   MOCK_ICLOUD_URL=http://mock-carddav:8080
   ```

2. **Использование реального iCloud**:
   ```bash
   ICLOUD_MODE=real
   # MOCK_ICLOUD_URL не используется
   ```

При `ICLOUD_MODE=real` клиент будет подключаться к `https://contacts.icloud.com` и потребует реальные учетные данные Apple ID и app-specific password.
