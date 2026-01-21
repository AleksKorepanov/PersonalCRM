from fastapi.testclient import TestClient

from app.main import create_app


def test_assistant_interaction_logged_in_audit(monkeypatch):
    workspace_id = "00000000-0000-0000-0000-000000002222"
    owner_id = "00000000-0000-0000-0000-000000002333"
    assistant_id = "00000000-0000-0000-0000-000000002444"

    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_WORKSPACE_ID", workspace_id)
    monkeypatch.setenv("DEV_USER_EMAIL", "audit_owner@local.dev")
    monkeypatch.setenv("DEV_USER_ID", owner_id)

    with TestClient(create_app()) as client:
        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Контакт для аудита", "tie_strength": "medium"},
        )
        assert contact.status_code == 201
        contact_id = contact.json()["id"]

        monkeypatch.setenv("DEV_USER_ID", assistant_id)
        monkeypatch.setenv("DEV_USER_EMAIL", "audit_assistant@local.dev")
        interaction = client.post(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "assistant"},
            json={"type": "call", "occurred_at": "2026-01-01T10:00:00+00:00"},
        )
        assert interaction.status_code == 201
        interaction_id = interaction.json()["id"]

        monkeypatch.setenv("DEV_USER_ID", owner_id)
        monkeypatch.setenv("DEV_USER_EMAIL", "audit_owner@local.dev")
        audit = client.get(
            "/api/v1/audit",
            params={"workspace_id": workspace_id, "entity_type": "interaction"},
            headers={"x-debug-role": "owner"},
        )
        assert audit.status_code == 200
        data = audit.json().get("data", [])
        assert any(
            item["entity_id"] == interaction_id
            and item["actor_user_id"] == assistant_id
            and item.get("after", {}).get("actor_role") == "assistant"
            for item in data
        )
