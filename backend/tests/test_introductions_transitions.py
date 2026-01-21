from fastapi.testclient import TestClient

from app.main import create_app


def test_introduction_invalid_status_transition(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000999")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000001111")
    monkeypatch.setenv("DEV_USER_EMAIL", "intro_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000001111"

    with TestClient(create_app()) as client:
        def create_contact(name: str) -> str:
            res = client.post(
                "/api/v1/contacts",
                params={"workspace_id": workspace_id},
                json={"display_name": name, "tie_strength": "medium"},
            )
            assert res.status_code == 201
            return res.json()["id"]

        requester_id = create_contact("Requester")
        introducer_id = create_contact("Introducer")
        target_id = create_contact("Target")

        intro = client.post(
            "/api/v1/introductions",
            params={"workspace_id": workspace_id},
            json={
                "requester_contact_id": requester_id,
                "introducer_contact_id": introducer_id,
                "target_contact_id": target_id,
                "ask": "Познакомьте нас",
                "consent_requester": False,
                "consent_target": False,
            },
        )
        assert intro.status_code == 201
        intro_id = intro.json()["id"]

        invalid = client.patch(
            f"/api/v1/introductions/{intro_id}",
            params={"workspace_id": workspace_id},
            json={"status": "sent"},
        )
        assert invalid.status_code == 400
