import uuid

from fastapi.testclient import TestClient

from app.main import create_app


def test_email_import_dedup(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("EMAIL_IMPORT_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000801")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000901")
    monkeypatch.setenv("DEV_USER_EMAIL", "email_import@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000000901"
    email = f"mail-{uuid.uuid4().hex}@example.com"

    app = create_app()
    with TestClient(app) as client:
        contact_payload = {
            "display_name": "Письмо Тест",
            "tie_strength": "medium",
            "visibility": "shared",
            "emails": [email],
        }
        contact_res = client.post("/api/v1/contacts", params={"workspace_id": workspace_id}, json=contact_payload)
        assert contact_res.status_code == 201

        message_id = f"msg-{uuid.uuid4().hex}"
        payload = [
            {
                "from": email,
                "to": ["owner@example.com"],
                "subject": "Тема письма",
                "date": "2026-01-20T10:00:00Z",
                "snippet": "Короткий сниппет",
                "message_id": message_id,
            }
        ]

        first = client.post("/api/v1/email/import", params={"workspace_id": workspace_id}, json=payload)
        assert first.status_code == 200
        assert first.json()["imported"] == 1
        assert first.json()["skipped"] == 0

        second = client.post("/api/v1/email/import", params={"workspace_id": workspace_id}, json=payload)
        assert second.status_code == 200
        assert second.json()["imported"] == 0
        assert second.json()["skipped"] == 1

        with app.state.pool.connection() as conn:
            conn.execute("SET LOCAL row_security = off")
            count = conn.execute(
                "SELECT count(*) FROM interactions WHERE workspace_id = %s AND outcome ILIKE %s AND deleted_at IS NULL",
                (workspace_id, f"%message_id:{message_id}%"),
            ).fetchone()[0]
            assert count == 1
