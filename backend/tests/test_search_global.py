from fastapi.testclient import TestClient

from app.main import create_app


def test_global_search_contacts_and_projects(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("SEARCH_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000701")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000702")
    monkeypatch.setenv("DEV_USER_EMAIL", "search_test@local.dev")

    with TestClient(create_app()) as client:
        me = client.get("/api/v1/me")
        assert me.status_code == 200
        workspace_id = me.json()["workspaces"][0]["workspace"]["id"]

        contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Мария Поиск",
                "tie_strength": "medium",
                "visibility": "shared",
                "emails": ["search@example.com"],
                "phones": ["+79990001111"],
            },
        )
        assert contact.status_code == 201

        project = client.post(
            "/api/v1/projects",
            params={"workspace_id": workspace_id},
            json={"name": "Проект Поиск", "status": "idea", "visibility": "shared", "participant_contact_ids": []},
        )
        assert project.status_code == 201

        response = client.get(
            "/api/v1/search",
            params={"workspace_id": workspace_id, "q": "Поиск"},
        )
        assert response.status_code == 200
        body = response.json()
        assert any(item["display_name"] == "Мария Поиск" for item in body.get("contacts", []))
        assert any(item["name"] == "Проект Поиск" for item in body.get("projects", []))
