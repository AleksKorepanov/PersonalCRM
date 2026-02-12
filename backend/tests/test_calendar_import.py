import json
import os
import uuid

from fastapi.testclient import TestClient

from app.main import create_app


def test_calendar_import_json_events(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("CALENDAR_IMPORT_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000601")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000701")
    monkeypatch.setenv("DEV_USER_EMAIL", "calendar_import@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000000701"

    app = create_app()
    with TestClient(app) as client:
        email = f"anna-{uuid.uuid4().hex}@example.com"
        contact_payload = {
            "display_name": "Анна Календарь",
            "tie_strength": "medium",
            "visibility": "shared",
            "emails": [email],
        }
        contact_res = client.post("/api/v1/contacts", params={"workspace_id": workspace_id}, json=contact_payload)
        assert contact_res.status_code == 201
        contact_id = contact_res.json()["id"]

        events = {
            "events": [
                {
                    "summary": "Созвон",
                    "start": "2026-01-20T10:00:00Z",
                    "attendees": [email],
                },
                {
                    "summary": "Без совпадения",
                    "start": "2026-01-21T09:00:00Z",
                    "attendees": ["unknown@example.com"],
                },
            ]
        }
        files = {
            "file": (
                "events.json",
                json.dumps(events, ensure_ascii=False).encode("utf-8"),
                "application/json",
            )
        }
        report = client.post("/api/v1/calendar/import", params={"workspace_id": workspace_id}, files=files)
        assert report.status_code == 200
        body = report.json()
        assert body["imported"] == 1
        assert body["skipped"] == 1
        assert body["errors"] == []

        with app.state.pool.connection() as conn:
            conn.execute("SET LOCAL row_security = off")
            user_id = conn.execute(
                "SELECT user_id FROM workspace_memberships WHERE workspace_id = %s LIMIT 1",
                (workspace_id,),
            ).fetchone()[0]
            conn.execute("SELECT set_config('app.user_id', %s, true)", (str(user_id),))
            conn.execute("SELECT set_config('app.workspace_id', %s, true)", (workspace_id,))
            count = conn.execute(
                "SELECT count(*) FROM interactions WHERE workspace_id = %s AND contact_id = %s AND deleted_at IS NULL",
                (workspace_id, contact_id),
            ).fetchone()[0]
            assert count == 1
