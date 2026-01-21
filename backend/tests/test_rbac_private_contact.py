from fastapi.testclient import TestClient

from app.main import create_app


def test_assistant_cannot_access_private_contact(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000001666")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000001777")
    monkeypatch.setenv("DEV_USER_EMAIL", "rbac_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000001777"

    with TestClient(create_app()) as client:
        created = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Приватный контакт", "tie_strength": "medium", "visibility": "private"},
        )
        assert created.status_code == 201
        contact_id = created.json()["id"]

        assistant = client.get(
            f"/api/v1/contacts/{contact_id}",
            params={"workspace_id": workspace_id},
            headers={"x-dev-role": "assistant"},
        )
        assert assistant.status_code in {403, 404}
