from fastapi.testclient import TestClient

from app.main import create_app


def test_audit_requires_owner(monkeypatch):
    workspace_id = "00000000-0000-0000-0000-000000009999"
    owner_id = "00000000-0000-0000-0000-000000009998"
    assistant_id = "00000000-0000-0000-0000-000000009997"

    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_WORKSPACE_ID", workspace_id)
    monkeypatch.setenv("DEV_USER_EMAIL", "audit_owner@local.dev")
    monkeypatch.setenv("DEV_USER_ID", owner_id)

    with TestClient(create_app()) as client:
        # ensure workspace exists
        me = client.get("/api/v1/me")
        assert me.status_code == 200

        contact_a = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Контакт аудита 1", "tie_strength": "medium"},
        )
        assert contact_a.status_code == 201
        contact_b = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={"display_name": "Контакт аудита 2", "tie_strength": "medium"},
        )
        assert contact_b.status_code == 201

        audit_owner = client.get(
            "/api/v1/audit",
            params={
                "workspace_id": workspace_id,
                "entity_type": "contact",
                "limit": 1,
            },
            headers={"x-debug-role": "owner"},
        )
        assert audit_owner.status_code == 200
        payload = audit_owner.json()
        assert payload.get("data")
        assert payload.get("next_cursor")

        first_item = payload["data"][0]
        audit_filtered = client.get(
            "/api/v1/audit",
            params={
                "workspace_id": workspace_id,
                "entity_type": "contact",
                "actor_user_id": first_item.get("actor_user_id"),
                "limit": 10,
            },
            headers={"x-debug-role": "owner"},
        )
        assert audit_filtered.status_code == 200
        assert any(
            item["id"] == first_item["id"] for item in audit_filtered.json().get("data", [])
        )

        audit_next = client.get(
            "/api/v1/audit",
            params={
                "workspace_id": workspace_id,
                "entity_type": "contact",
                "limit": 1,
                "cursor": payload.get("next_cursor"),
            },
            headers={"x-debug-role": "owner"},
        )
        assert audit_next.status_code == 200
        assert audit_next.json().get("data")

        monkeypatch.setenv("DEV_USER_ID", assistant_id)
        monkeypatch.setenv("DEV_USER_EMAIL", "audit_assistant@local.dev")
        audit = client.get(
            "/api/v1/audit",
            params={"workspace_id": workspace_id},
            headers={"x-debug-role": "assistant"},
        )
        assert audit.status_code == 403
