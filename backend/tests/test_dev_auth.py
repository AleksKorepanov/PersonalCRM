from fastapi.testclient import TestClient

from app.main import create_app


def test_dev_mode_allows_contacts_without_token(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000111")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000222")
    monkeypatch.setenv("DEV_USER_EMAIL", "dev_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000000222"

    with TestClient(create_app()) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        contacts = client.get("/api/v1/contacts", params={"workspace_id": workspace_id})
        assert contacts.status_code == 200
