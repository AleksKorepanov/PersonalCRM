from datetime import datetime, timedelta, timezone
import uuid

from fastapi.testclient import TestClient

from app.main import create_app


def test_reminders_due_before_filter(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    user_id = str(uuid.uuid4())
    workspace_id = str(uuid.uuid4())
    monkeypatch.setenv("DEV_USER_ID", user_id)
    monkeypatch.setenv("DEV_WORKSPACE_ID", workspace_id)
    monkeypatch.setenv("DEV_USER_EMAIL", f"reminders_test_{uuid.uuid4().hex}@local.dev")

    with TestClient(create_app()) as client:
        due_at = datetime.now(tz=timezone.utc).isoformat()
        created = client.post(
            "/api/v1/reminders",
            params={"workspace_id": workspace_id},
            json={"type": "follow_up", "due_at": due_at, "title": "Тестовое напоминание"},
        )
        assert created.status_code == 201
        reminder_id = created.json()["id"]

        due_before = (datetime.now(tz=timezone.utc) + timedelta(hours=1)).isoformat()
        listed = client.get(
            "/api/v1/reminders",
            params={"workspace_id": workspace_id, "due_before": due_before},
        )
        assert listed.status_code == 200
        ids = {item["id"] for item in listed.json().get("data", [])}
        assert reminder_id in ids
