# Контекстный пакет (Раздел 0)

Этот пакет добавляет в проект:
- docs/00_PRODUCT_CONTEXT_RU.md — контекст продукта
- docs/01_REQUIREMENTS_RU.md — требования
- docs/02_ACCEPTANCE_TESTS_RU.md — команды проверок/приёмки
- docs/03_GLOSSARY_RU.md — глоссарий (RU UI)
- docs/04_ROADMAP.md — roadmap
- .cursor/rules — правила Codex/Cursor (contract-first + RU UI)

## Что сделать после распаковки
1) Убедитесь, что вы в корне проекта:
```bash
ls -la docker-compose.yml
```
2) Запустите:
```bash
docker compose up --build
```
3) Примените миграции:
```bash
docker compose exec backend alembic upgrade head
```
