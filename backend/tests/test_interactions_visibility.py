from fastapi.testclient import TestClient

from app.main import create_app


def test_assistant_cannot_see_private_contact_interactions(monkeypatch):
    workspace_id = "00000000-0000-0000-0000-000000004444"
    owner_id = "00000000-0000-0000-0000-000000004445"
    assistant_id = "00000000-0000-0000-0000-000000004446"

    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_WORKSPACE_ID", workspace_id)
    monkeypatch.setenv("DEV_USER_EMAIL", "owner_interactions@local.dev")
    monkeypatch.setenv("DEV_USER_ID", owner_id)

    with TestClient(create_app()) as client:
        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Приватный контакт", "tie_strength": "medium", "visibility": "private"},
        )
        assert contact.status_code == 201
        contact_id = contact.json()["id"]

        interaction = client.post(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            json={"type": "call", "occurred_at": "2026-01-01T10:00:00+00:00"},
        )
        assert interaction.status_code == 201

        monkeypatch.setenv("DEV_USER_ID", assistant_id)
        monkeypatch.setenv("DEV_USER_EMAIL", "assistant_interactions@local.dev")

        assistant_list = client.get(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "assistant"},
        )
        assert assistant_list.status_code == 200
        assert assistant_list.json().get("data") == []

        owner_list = client.get(
            f"/api/v1/contacts/{contact_id}/interactions",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "owner"},
        )
        assert owner_list.status_code == 200
        assert len(owner_list.json().get("data", [])) == 1
