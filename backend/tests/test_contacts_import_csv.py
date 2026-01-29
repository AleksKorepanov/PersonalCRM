from fastapi.testclient import TestClient

from app.main import create_app


def test_contacts_import_csv(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("IMPORT_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000999")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000998")
    monkeypatch.setenv("DEV_USER_EMAIL", "import_test@local.dev")

    csv_content = "\n".join(
        [
            "name,email,phone,company,tags",
            "Иван,ivan@example.com,+79990001122,Acme,\"vip;lead\"",
            ",bad@example.com,+79990002222,Acme,tag",
            "Петр,petr@example.com,+79990003344,Acme,tag2",
        ]
    )

    with TestClient(create_app()) as client:
        me = client.get("/api/v1/me")
        assert me.status_code == 200
        workspace_id = me.json()["workspaces"][0]["workspace"]["id"]

        response = client.post(
            "/api/v1/contacts/import",
            params={"workspace_id": workspace_id},
            files={"file": ("contacts.csv", csv_content.encode("utf-8"), "text/csv")},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["imported"] == 2
        assert body["skipped"] == 1
        assert len(body["errors"]) == 1
        assert body["errors"][0]["line"] == 3
        assert body["errors"][0]["message"] == "Имя обязательно"
