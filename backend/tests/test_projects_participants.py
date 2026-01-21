from fastapi.testclient import TestClient

from app.main import create_app


def test_project_participants_flow(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000001444")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000001555")
    monkeypatch.setenv("DEV_USER_EMAIL", "projects_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000001555"

    with TestClient(create_app()) as client:
        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Участник проекта", "tie_strength": "medium"},
        )
        assert contact.status_code == 201
        contact_id = contact.json()["id"]

        project = client.post(
            "/api/v1/projects",
            params={"workspace_id": workspace_id},
            json={"name": "Проект A"},
        )
        assert project.status_code == 201
        project_id = project.json()["id"]

        updated = client.patch(
            f"/api/v1/projects/{project_id}",
            params={"workspace_id": workspace_id},
            json={"participant_contact_ids": [contact_id]},
        )
        assert updated.status_code == 200

        fetched = client.get(f"/api/v1/projects/{project_id}", params={"workspace_id": workspace_id})
        assert fetched.status_code == 200
        participants = fetched.json().get("participant_contact_ids", [])
        assert contact_id in participants
