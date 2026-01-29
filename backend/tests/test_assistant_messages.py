from fastapi.testclient import TestClient

from app.main import create_app


def test_assistant_messages_owner_visibility(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000881")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000882")
    monkeypatch.setenv("DEV_USER_EMAIL", "assistant_message_test@local.dev")

    with TestClient(create_app()) as client:
        me = client.get("/api/v1/me")
        assert me.status_code == 200
        workspace_id = me.json()["workspaces"][0]["workspace"]["id"]

        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            headers={"X-Debug-Role": "owner"},
            json={
                "display_name": "Контакт для сообщения",
                "tie_strength": "medium",
                "visibility": "shared",
            },
        )
        assert contact.status_code == 201
        contact_id = contact.json()["id"]

        message = client.post(
            "/api/v1/assistant/messages",
            params={"workspace_id": workspace_id},
            headers={"X-Debug-Role": "assistant"},
            json={
                "target_type": "contact",
                "target_id": contact_id,
                "task": "Связаться с контактом",
                "reason": "Уточнить детали проекта",
                "due_at": "2026-01-25T10:00:00Z",
            },
        )
        assert message.status_code == 200

        forbidden = client.get(
            "/api/v1/audit",
            params={"workspace_id": workspace_id},
            headers={"X-Debug-Role": "assistant"},
        )
        assert forbidden.status_code == 403

        audit = client.get(
            "/api/v1/audit",
            params={"workspace_id": workspace_id, "entity_type": "interaction"},
            headers={"X-Debug-Role": "owner"},
        )
        assert audit.status_code == 200
        data = audit.json()["data"]
        match = [item for item in data if item.get("action_key") == "assistant_message.create"]
        assert match
        event = match[0]
        after = event.get("after") or {}
        assert after.get("message_type") == "assistant_message"
        assert after.get("target_id") == contact_id
