from fastapi.testclient import TestClient

from app.main import create_app


def test_contacts_merge_moves_interactions(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("MERGE_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000779")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000780")
    monkeypatch.setenv("DEV_USER_EMAIL", "merge_test@local.dev")

    with TestClient(create_app()) as client:
        me = client.get("/api/v1/me")
        assert me.status_code == 200
        workspace_id = me.json()["workspaces"][0]["workspace"]["id"]

        primary = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Основной контакт", "tie_strength": "medium", "visibility": "shared"},
        )
        assert primary.status_code == 201
        primary_id = primary.json()["id"]

        duplicate = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Дубликат", "tie_strength": "medium", "visibility": "shared"},
        )
        assert duplicate.status_code == 201
        duplicate_id = duplicate.json()["id"]

        interaction = client.post(
            f"/api/v1/contacts/{duplicate_id}/interactions",
            params={"workspace_id": workspace_id},
            json={"type": "call", "occurred_at": "2026-01-20T10:00:00Z", "summary": "Связались"},
        )
        assert interaction.status_code == 201
        interaction_id = interaction.json()["id"]

        merged = client.post(
            "/api/v1/contacts/merge",
            params={"workspace_id": workspace_id},
            json={"primary_contact_id": primary_id, "merge_contact_ids": [duplicate_id]},
        )
        assert merged.status_code == 200

        interaction_after = client.get(
            f"/api/v1/interactions/{interaction_id}",
            params={"workspace_id": workspace_id},
        )
        assert interaction_after.status_code == 200
        assert interaction_after.json()["contact_id"] == primary_id

        missing = client.get(
            f"/api/v1/contacts/{duplicate_id}",
            params={"workspace_id": workspace_id},
        )
        assert missing.status_code == 404
