from fastapi.testclient import TestClient

from app.main import create_app


def test_contacts_crud_flow(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000333")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000444")
    monkeypatch.setenv("DEV_USER_EMAIL", "contacts_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000000444"

    with TestClient(create_app()) as client:
        create_payload = {
            "display_name": "Тестовый контакт",
            "tie_strength": "medium",
            "visibility": "shared",
            "emails": ["test@example.com"],
        }
        created = client.post("/api/v1/contacts", params={"workspace_id": workspace_id}, json=create_payload)
        assert created.status_code == 201
        created_body = created.json()
        contact_id = created_body["id"]

        fetched = client.get(f"/api/v1/contacts/{contact_id}", params={"workspace_id": workspace_id})
        assert fetched.status_code == 200
        assert fetched.json()["id"] == contact_id

        patch_payload = {"display_name": "Обновленный контакт"}
        updated = client.patch(
            f"/api/v1/contacts/{contact_id}",
            params={"workspace_id": workspace_id},
            json=patch_payload,
        )
        assert updated.status_code == 200
        assert updated.json()["display_name"] == "Обновленный контакт"

        listed = client.get("/api/v1/contacts", params={"workspace_id": workspace_id})
        assert listed.status_code == 200
        ids = {item["id"] for item in listed.json().get("data", [])}
        assert contact_id in ids

        deleted = client.delete(f"/api/v1/contacts/{contact_id}", params={"workspace_id": workspace_id})
        assert deleted.status_code == 204

        missing = client.get(f"/api/v1/contacts/{contact_id}", params={"workspace_id": workspace_id})
        assert missing.status_code == 404
