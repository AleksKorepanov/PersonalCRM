from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import create_app


def test_contact_interactions_timeline_sorted(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000555")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000666")
    monkeypatch.setenv("DEV_USER_EMAIL", "timeline_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000000666"

    with TestClient(create_app()) as client:
        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Контакт для таймлайна", "tie_strength": "medium"},
        )
        assert contact.status_code == 201
        contact_id = contact.json()["id"]

        now = datetime.now(tz=timezone.utc)
        older = (now - timedelta(days=1)).isoformat()
        newer = now.isoformat()

        first = client.post(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            json={"type": "call", "occurred_at": older, "summary": "Старое"},
        )
        assert first.status_code == 201

        second = client.post(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            json={"type": "call", "occurred_at": newer, "summary": "Новое"},
        )
        assert second.status_code == 201

        timeline = client.get(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
        )
        assert timeline.status_code == 200
        data = timeline.json().get("data", [])
        assert len(data) >= 2
        assert data[0]["summary"] == "Новое"
        assert data[1]["summary"] == "Старое"
