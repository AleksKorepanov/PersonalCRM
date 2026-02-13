# Спецификация синхронизации iCloud Contacts

## Цель

Реализовать двустороннюю синхронизацию контактов между PersonalCRM и iCloud через CardDAV протокол, обеспечивая:
- Автоматическую синхронизацию изменений
- Связывание контактов между системами
- Обработку конфликтов
- Безопасное хранение учетных данных

---

## 1. UX вкладки "iPhone"

### 1.1 Таблица контактов iCloud

**Маршрут:** `/contacts/icloud` или вкладка "iPhone" в навигации

**Компонент:** `ICloudContactsPage.tsx`

**Функциональность:**
- Таблица с колонками:
  - Имя (display_name из iCloud)
  - Телефон (первый primary или первый доступный)
  - Email (первый primary или первый доступный)
  - Статус связи (связан/не связан с CRM контактом)
  - Последняя синхронизация
  - Действия (просмотр, связать, отвязать)
- Пагинация (50 записей на страницу)
- Фильтры:
  - Только несвязанные
  - Только связанные
  - Поиск по имени/телефону/email

**Состояния:**
- Загрузка (`loading: true`)
- Ошибка подключения (`error: "connection_failed"`)
- Нет подключенного аккаунта (`account: null`)
- Пустой список (`contacts: []`)

### 1.2 Поиск

**Компонент:** `ICloudSearchBar.tsx`

**Функциональность:**
- Поиск по имени, телефону, email
- Дебаунс 300ms
- Подсветка совпадений
- Сохранение поискового запроса в URL (`?q=...`)

### 1.3 Карточка iCloud контакта

**Маршрут:** `/contacts/icloud/:icloud_contact_id`

**Компонент:** `ICloudContactCardPage.tsx`

**Отображение:**
- Полная информация из iCloud (все поля vCard)
- Кнопка "Связать с CRM контактом" (если не связан)
- Кнопка "Отвязать" (если связан)
- Кнопка "Синхронизировать сейчас"
- История синхронизаций (когда последний раз обновлялся)

**Действия:**
- Связать с существующим CRM контактом (модальное окно выбора)
- Создать новый CRM контакт на основе iCloud контакта
- Отвязать от CRM контакта

---

## 2. Подключение iCloud

### 2.1 Форма подключения

**Маршрут:** `/settings/icloud` или модальное окно при первом открытии вкладки "iPhone"

**Компонент:** `ICloudConnectForm.tsx`

**Поля:**
- Apple ID (email)
- App-specific password (текстовое поле с типом `password`)
- Кнопка "Подключить"

**Валидация:**
- Apple ID: формат email
- App-specific password: минимум 16 символов, формат `xxxx-xxxx-xxxx-xxxx`

**Инструкция:**
Показать ссылку на инструкцию по созданию app-specific password:
"Для подключения требуется app-specific password. Создайте его на https://appleid.apple.com → Sign-In and Security → App-Specific Passwords"

### 2.2 Безопасность хранения

**Backend:** `backend/app/services/icloud_auth.py`

**Хранение учетных данных:**
- Таблица `icloud_accounts`:
  ```sql
  CREATE TABLE icloud_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    apple_id text NOT NULL,  -- зашифрован
    app_password_encrypted text NOT NULL,  -- зашифрован AES-256-GCM
    encryption_key_id text,  -- ID ключа для ротации
    sync_enabled boolean NOT NULL DEFAULT true,
    last_sync_at timestamptz,
    sync_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, user_id)
  );
  ```

**Шифрование:**
- Использовать `cryptography.fernet` или `cryptography.hazmat.primitives.ciphers.aead.AESGCM`
- Ключ шифрования хранить в переменной окружения `ICLOUD_ENCRYPTION_KEY` (32 байта)
- При отсутствии ключа — генерировать при первом запуске и сохранять в секретном хранилище (Vault/AWS Secrets Manager)

**Токены доступа:**
- CardDAV использует Basic Auth (Apple ID + app-specific password)
- Не хранить токены отдельно — использовать учетные данные напрямую

**RBAC:**
- Только owner workspace может подключать/отключать iCloud
- Assistant/limited не видят учетные данные

---

## 3. Модель данных

### 3.1 Таблица `icloud_accounts`

```sql
CREATE TABLE icloud_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  apple_id text NOT NULL,  -- зашифрован
  app_password_encrypted text NOT NULL,  -- зашифрован
  encryption_key_id text,
  sync_enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  sync_error text,
  sync_etag text,  -- последний ETag для инкрементальной синхронизации
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_icloud_accounts_ws ON icloud_accounts(workspace_id);
CREATE INDEX idx_icloud_accounts_user ON icloud_accounts(user_id);
```

### 3.2 Таблица `icloud_contacts`

```sql
CREATE TABLE icloud_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  icloud_account_id uuid NOT NULL REFERENCES icloud_accounts(id) ON DELETE CASCADE,
  
  -- CardDAV метаданные
  remote_uri text NOT NULL,  -- URL ресурса в iCloud (например, /12345/card.vcf)
  etag text NOT NULL,  -- ETag для отслеживания изменений
  vcard_raw text NOT NULL,  -- полный vCard в формате vCard 3.0/4.0
  
  -- Извлеченные поля (для быстрого поиска)
  display_name text,
  given_name text,
  family_name text,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label, value, is_primary}]
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{label, value, is_primary}]
  
  -- Синхронизация
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  sync_direction text,  -- 'icloud_to_crm', 'crm_to_icloud', 'bidirectional'
  conflict_resolution text,  -- 'icloud_wins', 'crm_wins', 'manual'
  
  -- Метаданные
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  
  UNIQUE(workspace_id, remote_uri)
);

CREATE INDEX idx_icloud_contacts_ws ON icloud_contacts(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_icloud_contacts_account ON icloud_contacts(icloud_account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_icloud_contacts_remote_uri ON icloud_contacts(remote_uri);
CREATE INDEX idx_icloud_contacts_display_name ON icloud_contacts USING GIN(display_name gin_trgm_ops) WHERE deleted_at IS NULL;
```

### 3.3 Таблица `contact_links`

```sql
CREATE TABLE contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  icloud_contact_id uuid NOT NULL REFERENCES icloud_contacts(id) ON DELETE CASCADE,
  
  -- Правила связывания
  link_type text NOT NULL,  -- 'auto', 'manual', 'phone_match', 'email_match'
  confidence_score smallint,  -- 1-100, для автоматических связей
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid REFERENCES users(id),
  
  UNIQUE(contact_id, icloud_contact_id)
);

CREATE INDEX idx_contact_links_contact ON contact_links(contact_id);
CREATE INDEX idx_contact_links_icloud ON contact_links(icloud_contact_id);
CREATE INDEX idx_contact_links_ws ON contact_links(workspace_id);
```

---

## 4. Нормализация телефона и правила связывания

### 4.1 Нормализация телефонов

**Функция:** `backend/app/services/phone_normalize.py`

**Алгоритм:**
1. Удалить все нецифровые символы кроме `+`
2. Если номер начинается с `+` — оставить как есть
3. Если номер без `+` и начинается с `8` (Россия) — заменить на `+7`
4. Если номер без `+` и начинается с `7` — добавить `+`
5. Если номер без `+` и длина < 10 — считать некорректным
6. Сохранить нормализованный формат: `+XXXXXXXXXXXX` (E.164)

**Примеры:**
- `+7 (999) 123-45-67` → `+79991234567`
- `8 999 123 45 67` → `+79991234567`
- `999-123-4567` → `+79991234567` (предполагаем Россию по workspace)
- `+1 555 123 4567` → `+15551234567`

### 4.2 Правила связывания

**Функция:** `backend/app/services/contact_linker.py`

**Приоритет связывания:**

1. **Точное совпадение нормализованного телефона** (confidence: 100)
   - Если у CRM контакта есть телефон `+79991234567`
   - И у iCloud контакта есть телефон `+79991234567`
   - → Автоматически связать

2. **Точное совпадение email** (confidence: 95)
   - Если email совпадает точно (case-insensitive)
   - → Автоматически связать

3. **Совпадение имени + телефон** (confidence: 80)
   - Если имя совпадает (fuzzy match, Levenshtein distance < 2)
   - И есть совпадение телефона (нормализованный)
   - → Предложить связать (требует подтверждения)

4. **Совпадение имени + email** (confidence: 75)
   - Если имя совпадает (fuzzy match)
   - И есть совпадение email
   - → Предложить связать (требует подтверждения)

5. **Только имя** (confidence: 50)
   - Если имя совпадает точно
   - → Показать в списке "Возможные совпадения" (требует ручного связывания)

**Fuzzy match имени:**
- Нормализовать: lowercase, удалить лишние пробелы
- Вычислить Levenshtein distance между `display_name`
- Если distance ≤ 2 и длина имени > 5 → считать совпадением

---

## 5. Алгоритм синхронизации

### 5.1 Первичная синхронизация

**Функция:** `backend/app/services/icloud_sync.py::initial_sync()`

**Шаги:**

1. **Подключение к CardDAV**
   ```python
   # URL: https://contacts.icloud.com/123456789/carddavhome/card/
   # Auth: Basic (apple_id, app_password)
   ```

2. **PROPFIND запрос для получения списка контактов**
   ```http
   PROPFIND /123456789/carddavhome/card/ HTTP/1.1
   Depth: 1
   ```

3. **Парсинг ответа**
   - Извлечь `href` (remote_uri) для каждого контакта
   - Извлечь `getetag` (ETag)
   - Сохранить в `icloud_contacts` с `sync_direction = 'icloud_to_crm'`

4. **Загрузка vCard для каждого контакта**
   ```http
   GET /123456789/carddavhome/card/contact123.vcf HTTP/1.1
   ```

5. **Парсинг vCard**
   - Использовать библиотеку `vobject` или `pycarddav`
   - Извлечь поля: FN, N, TEL, EMAIL, ADR, BDAY, NOTE и т.д.
   - Сохранить `vcard_raw` и извлеченные поля

6. **Попытка автоматического связывания**
   - Для каждого iCloud контакта найти возможные совпадения в CRM
   - Если confidence ≥ 80 → автоматически связать
   - Если confidence < 80 → добавить в очередь для ручного связывания

7. **Сохранение ETag**
   - Сохранить последний ETag в `icloud_accounts.sync_etag`

### 5.2 Инкрементальная синхронизация

**Функция:** `backend/app/services/icloud_sync.py::incremental_sync()`

**Шаги:**

1. **PROPFIND с фильтром по времени**
   ```http
   PROPFIND /123456789/carddavhome/card/ HTTP/1.1
   Depth: 1
   <C:filter>
     <C:prop-filter>
       <C:getcontentlength/>
     </C:prop-filter>
   </C:filter>
   ```

2. **Сравнение ETag**
   - Для каждого контакта сравнить ETag с сохраненным в БД
   - Если ETag изменился → контакт обновлен в iCloud
   - Если контакт есть в ответе, но нет в БД → новый контакт
   - Если контакт есть в БД, но нет в ответе → удален в iCloud

3. **Обработка изменений**
   - **Обновлен:** Загрузить новый vCard, обновить в БД, синхронизировать с CRM (если связан)
   - **Новый:** Загрузить vCard, создать запись в `icloud_contacts`, попытаться связать
   - **Удален:** Пометить `deleted_at`, отвязать от CRM (или оставить связь, но пометить как удаленный)

4. **Синхронизация изменений из CRM в iCloud**
   - Найти все связанные контакты, измененные после `last_sync_at`
   - Для каждого:
     - Если `sync_direction = 'bidirectional'` или `'crm_to_icloud'`
     - Обновить vCard в iCloud через PUT запрос
     - Обновить ETag в БД

### 5.3 Расписание синхронизации

**Backend:** Celery задача или cron job

**Частота:**
- Инкрементальная синхронизация: каждые 15 минут
- Полная синхронизация: раз в сутки (ночью)

**Задача:** `backend/app/tasks/icloud_sync.py`
```python
@celery_app.task
def sync_icloud_accounts():
    accounts = get_active_icloud_accounts()
    for account in accounts:
        try:
            incremental_sync(account.id)
        except Exception as e:
            log_error(account.id, str(e))
```

---

## 6. Политика конфликтов и идемпотентность

### 6.1 Типы конфликтов

1. **Конфликт изменения** (оба контакта изменены)
   - CRM контакт изменен в PersonalCRM
   - iCloud контакт изменен в iCloud
   - Оба изменения после последней синхронизации

2. **Конфликт удаления** (один удален, другой изменен)
   - CRM контакт удален
   - iCloud контакт изменен (или наоборот)

3. **Конфликт связывания** (один контакт связан с разными)
   - iCloud контакт A связан с CRM контактом X
   - Но iCloud контакт A также соответствует CRM контакту Y

### 6.2 Политика разрешения конфликтов

**Настройка на уровне workspace:** `icloud_accounts.conflict_resolution`

**Варианты:**

1. **`icloud_wins`** (по умолчанию)
   - При конфликте всегда использовать версию из iCloud
   - Обновить CRM контакт данными из iCloud

2. **`crm_wins`**
   - При конфликте всегда использовать версию из CRM
   - Обновить iCloud контакт данными из CRM

3. **`manual`**
   - При конфликте создать запись в таблице `sync_conflicts`
   - Показать пользователю модальное окно выбора версии
   - Пользователь выбирает, какая версия сохраняется

**Таблица конфликтов:**
```sql
CREATE TABLE sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  icloud_contact_id uuid REFERENCES icloud_contacts(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,  -- 'both_changed', 'deleted_vs_modified'
  crm_version jsonb NOT NULL,  -- снимок CRM контакта
  icloud_version jsonb NOT NULL,  -- снимок iCloud контакта
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution text,  -- 'icloud_wins', 'crm_wins', 'merge'
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 6.3 Идемпотентность

**Принципы:**

1. **ETag как версия**
   - Каждое изменение в iCloud меняет ETag
   - Если ETag не изменился → пропустить синхронизацию

2. **Таймстемпы**
   - Использовать `updated_at` для отслеживания изменений в CRM
   - Синхронизировать только контакты, измененные после `last_sync_at`

3. **Повторные запросы**
   - Все операции синхронизации должны быть идемпотентными
   - Повторный запуск синхронизации не должен создавать дубликаты

4. **Транзакции**
   - Каждая синхронизация выполняется в транзакции
   - При ошибке — откат всех изменений

---

## 7. Автосоздание iCloud-контакта при создании CRM контакта

### 7.1 Настройка

**Поле в workspace:** `settings.auto_create_icloud_contact` (boolean, default: false)

**Условия:**
- Работает только если подключен iCloud аккаунт
- Работает только если `sync_enabled = true`

### 7.2 Алгоритм

**Функция:** `backend/app/services/contacts.py::create_contact()` (расширение)

**Шаги:**

1. После создания CRM контакта проверить настройку
2. Если `auto_create_icloud_contact = true`:
   - Получить активный iCloud аккаунт для workspace
   - Создать vCard из данных CRM контакта:
     ```
     BEGIN:VCARD
     VERSION:3.0
     FN:Иван Иванов
     N:Иванов;Иван;;;
     TEL;TYPE=CELL:+79991234567
     EMAIL;TYPE=WORK:ivan@example.com
     END:VCARD
     ```
   - Отправить PUT запрос в CardDAV:
     ```http
     PUT /123456789/carddavhome/card/contact-{uuid}.vcf HTTP/1.1
     Content-Type: text/vcard
     ```
   - Сохранить созданный контакт в `icloud_contacts`
   - Автоматически связать с CRM контактом (`link_type = 'auto'`)

3. Если создание не удалось:
   - Логировать ошибку
   - Не блокировать создание CRM контакта
   - Показать уведомление пользователю

---

## 8. Тестирование

### 8.1 Unit тесты

**Файлы:**
- `backend/tests/test_phone_normalize.py`
- `backend/tests/test_contact_linker.py`
- `backend/tests/test_icloud_auth.py`
- `backend/tests/test_vcard_parser.py`

**Покрытие:**
- Нормализация телефонов (все форматы)
- Правила связывания (все сценарии)
- Шифрование/дешифрование учетных данных
- Парсинг vCard (различные версии, поля)

### 8.2 Integration тесты

**Файлы:**
- `backend/tests/test_icloud_sync.py`

**Сценарии:**
- Первичная синхронизация (mock CardDAV server)
- Инкрементальная синхронизация (изменения ETag)
- Связывание контактов (автоматическое и ручное)
- Разрешение конфликтов (все политики)
- Автосоздание iCloud контакта

**Mock CardDAV Server:**
- Использовать библиотеку `vcrpy` для записи/воспроизведения HTTP запросов
- Или создать простой mock сервер на Flask/FastAPI:
  ```python
  @app.route("/carddavhome/card/", methods=["PROPFIND"])
  def propfind():
      # Возвращает список контактов
      pass
  ```

### 8.3 E2E тесты

**Файлы:**
- `frontend/tests/e2e/icloud/connect.spec.ts`
- `frontend/tests/e2e/icloud/sync.spec.ts`
- `frontend/tests/e2e/icloud/link.spec.ts`

**Сценарии:**
1. **Подключение iCloud**
   - Открыть форму подключения
   - Ввести Apple ID и app-specific password
   - Проверить успешное подключение

2. **Синхронизация**
   - Нажать "Синхронизировать сейчас"
   - Дождаться завершения
   - Проверить появление контактов в таблице

3. **Связывание**
   - Выбрать iCloud контакт
   - Нажать "Связать с CRM контактом"
   - Выбрать CRM контакт из списка
   - Проверить успешное связывание

4. **Автосоздание**
   - Включить настройку "Автосоздание iCloud контакта"
   - Создать новый CRM контакт
   - Проверить создание соответствующего iCloud контакта

**Mock данные:**
- Использовать фикстуры с предопределенными контактами
- Mock API endpoints для CardDAV

---

## 9. Файлы и команды проверки

### 9.1 Созданные/измененные файлы

**Backend:**
- `backend/app/models/icloud.py` — модели SQLAlchemy
- `backend/app/schemas/icloud.py` — Pydantic схемы
- `backend/app/services/icloud_auth.py` — аутентификация и шифрование
- `backend/app/services/icloud_sync.py` — синхронизация
- `backend/app/services/phone_normalize.py` — нормализация телефонов
- `backend/app/services/contact_linker.py` — связывание контактов
- `backend/app/services/vcard_parser.py` — парсинг vCard
- `backend/app/api/v1/icloud.py` — API endpoints
- `backend/alembic/versions/XXXX_add_icloud_tables.py` — миграция БД
- `backend/tests/test_icloud_*.py` — тесты

**Frontend:**
- `frontend/src/pages/ICloudContactsPage.tsx` — таблица контактов
- `frontend/src/pages/ICloudContactCardPage.tsx` — карточка контакта
- `frontend/src/components/ICloudConnectForm.tsx` — форма подключения
- `frontend/src/components/ICloudSearchBar.tsx` — поиск
- `frontend/src/components/ContactLinkModal.tsx` — модальное окно связывания
- `frontend/src/services/icloudApi.ts` — API клиент
- `frontend/src/i18n/ru.ts` — переводы (добавить ключи для iCloud)
- `frontend/tests/e2e/icloud/*.spec.ts` — E2E тесты

**Документация:**
- `docs/12_ICLOUD_SYNC_SPEC_RU.md` — этот документ

### 9.2 Команды проверки

**Сборка и запуск:**
```bash
# Пересобрать проект
docker compose up --build -d

# Проверить статус контейнеров
docker compose ps
```

**Backend тесты:**
```bash
# Запустить все тесты
docker compose exec -T backend pytest -q

# Запустить только тесты iCloud
docker compose exec -T backend pytest tests/test_icloud_*.py -v

# Проверить покрытие
docker compose exec -T backend pytest --cov=app/services/icloud --cov-report=html
```

**Frontend проверки:**
```bash
# Проверка русского языка
cd frontend && npm run check:ru

# Линтинг
cd frontend && npm run lint

# E2E тесты
cd frontend && npm run test:e2e
```

**Миграции БД:**
```bash
# Применить миграции
docker compose exec -T backend alembic upgrade head

# Проверить текущую версию
docker compose exec -T backend alembic current
```

**Проверка API:**
```bash
# Проверить health endpoint
curl http://localhost:8000/api/v1/health

# Проверить iCloud endpoints (требует аутентификации)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/icloud/accounts
```

### 9.3 Критерии успеха

✅ **Сборка зеленая:**
- `docker compose up --build` завершается без ошибок
- Все контейнеры в статусе `healthy` или `running`

✅ **Тесты проходят:**
- Все unit тесты проходят
- Все integration тесты проходят
- E2E тесты проходят (или пропущены с пометкой `@skip` если требуют реального iCloud)

✅ **Линтинг чистый:**
- `pytest` без warnings (кроме ожидаемых deprecation)
- `npm run lint` без ошибок
- `npm run check:ru` без найденных английских строк

✅ **Миграции применены:**
- `alembic upgrade head` успешно
- Все таблицы созданы в БД

---

## Примечания

- **Безопасность:** App-specific password никогда не должен логироваться или отображаться в UI после ввода
- **Производительность:** Синхронизация больших объемов (>1000 контактов) должна выполняться асинхронно через Celery
- **Ограничения:** Apple CardDAV имеет rate limits — не более 100 запросов в минуту на аккаунт
- **Мониторинг:** Логировать все операции синхронизации для отладки проблем
