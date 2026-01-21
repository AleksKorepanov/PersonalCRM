from fastapi.testclient import TestClient

from app.main import create_app


def test_assistant_visibility_private_and_limited(monkeypatch):
    workspace_id = "00000000-0000-0000-0000-000000003333"
    owner_id = "00000000-0000-0000-0000-000000003334"
    assistant_id = "00000000-0000-0000-0000-000000003335"

    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_WORKSPACE_ID", workspace_id)
    monkeypatch.setenv("DEV_USER_EMAIL", "owner_visibility@local.dev")
    monkeypatch.setenv("DEV_USER_ID", owner_id)

    with TestClient(create_app()) as client:
        private_contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Приватный контакт",
                "tie_strength": "medium",
                "visibility": "private",
            },
        )
        assert private_contact.status_code == 201
        private_id = private_contact.json()["id"]

        limited_contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Ограниченный контакт",
                "tie_strength": "medium",
                "visibility": "limited",
                "shared_notes": "Общие заметки",
                "private_notes": "Приватные заметки",
                "trust_score": 8,
                "emotional_balance": 0.75,
                "how_can_help": ["интро"],
                "how_i_can_help": ["консультация"],
            },
        )
        assert limited_contact.status_code == 201
        limited_id = limited_contact.json()["id"]

        monkeypatch.setenv("DEV_USER_ID", assistant_id)
        monkeypatch.setenv("DEV_USER_EMAIL", "assistant_visibility@local.dev")

        private_get = client.get(
            f"/api/v1/contacts/{private_id}",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "assistant"},
        )
        assert private_get.status_code == 404

        limited_get = client.get(
            f"/api/v1/contacts/{limited_id}",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "assistant"},
        )
        assert limited_get.status_code == 200
        data = limited_get.json()
        assert data["visibility"] == "limited"
        assert data["shared_notes"] is None
        assert data["private_notes"] is None
        assert data["trust_score"] is None
        assert data["emotional_balance"] is None
        assert data["how_can_help"] == []
        assert data["how_i_can_help"] == []
