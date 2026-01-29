from fastapi.testclient import TestClient

from app.main import create_app


def test_contacts_duplicates(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DUPLICATES_ENABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000777")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000778")
    monkeypatch.setenv("DEV_USER_EMAIL", "duplicates_test@local.dev")

    with TestClient(create_app()) as client:
        me = client.get("/api/v1/me")
        assert me.status_code == 200
        workspace_id = me.json()["workspaces"][0]["workspace"]["id"]

        contact_one = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Петров",
                "tie_strength": "medium",
                "visibility": "shared",
                "emails": ["dup@example.com"],
                "phones": ["+79990001122"],
            },
        )
        assert contact_one.status_code == 201
        id_one = contact_one.json()["id"]

        contact_two = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Петров",
                "tie_strength": "medium",
                "visibility": "shared",
                "emails": ["dup@example.com"],
                "phones": ["+79990002222"],
            },
        )
        assert contact_two.status_code == 201
        id_two = contact_two.json()["id"]

        contact_three = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Петрович",
                "tie_strength": "medium",
                "visibility": "shared",
                "emails": ["unique@example.com"],
                "phones": ["+79990003333"],
            },
        )
        assert contact_three.status_code == 201
        id_three = contact_three.json()["id"]

        response = client.get(
            "/api/v1/contacts/duplicates",
            params={"workspace_id": workspace_id},
        )
        assert response.status_code == 200
        body = response.json()
        groups = body.get("groups", [])
        assert groups

        email_groups = [g for g in groups if g.get("reason") == "email"]
        assert email_groups
        email_ids = {email_groups[0]["primary_contact"]["id"], *[c["id"] for c in email_groups[0]["candidates"]]}
        assert {id_one, id_two}.issubset(email_ids)

        name_groups = [g for g in groups if g.get("reason") == "name"]
        assert name_groups
        name_group_ids = set()
        for group in name_groups:
            name_group_ids.add(group["primary_contact"]["id"])
            name_group_ids.update([c["id"] for c in group["candidates"]])
        assert id_three in name_group_ids
