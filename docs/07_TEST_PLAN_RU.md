## План тестирования (E2E)

Цель: покрыть ключевые пользовательские сценарии PersonalCRM, включая RBAC, аудит и сетевые функции.

### Матрица сценариев → тесты

- Smoke / навигация
  - `frontend/tests/e2e/smoke/app.spec.ts`
  - Проверка: приложение открывается, меню доступно, шапка присутствует.

- Контакты
  - `frontend/tests/e2e/contacts/contacts.spec.ts`
  - Проверка: создание, поиск по шапке, редактирование, удаление (soft delete).

- Карточка контакта / вкладки
  - `frontend/tests/e2e/contacts/contact-card.spec.ts`
  - Проверка: вкладки отражаются в URL.

- Взаимодействия (таймлайн)
  - `frontend/tests/e2e/interactions/timeline.spec.ts`
  - Проверка: добавление взаимодействия, фильтры.

- Напоминания
  - `frontend/tests/e2e/reminders/reminders.spec.ts`
  - Проверка: создание из карточки, появление в списке.

- Интродукции
  - `frontend/tests/e2e/introductions/introductions.spec.ts`
  - Проверка: создание, копирование текста, список.

- RBAC / приватность
  - `frontend/tests/e2e/rbac/rbac.spec.ts`
  - Проверка: private скрыт, limited виден, «Аудит» недоступен ассистенту.

- Аудит
  - `frontend/tests/e2e/audit/audit.spec.ts`
  - Проверка: запись появляется после действия ассистента, детали доступны.

- Нетворкинг‑панель
  - `frontend/tests/e2e/networking/week-panel.spec.ts`
  - Проверка: блоки отображаются, очередь действий обновляется.

- Стратегия (каденции)
  - `frontend/tests/e2e/strategy/strategy.spec.ts`
  - Проверка: сохранение настроек каденций.

- Проекты (placeholder)
  - `frontend/tests/e2e/projects/projects.spec.ts`
  - Проверка: страница доступна.

### Как запускать
```
cd frontend
npm run test:e2e
```

### Артефакты
- HTML отчёт: `frontend/playwright-report`
- Трейсы и скриншоты: `frontend/test-results`
