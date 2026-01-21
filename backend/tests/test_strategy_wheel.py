from fastapi.testclient import TestClient

from app.main import create_app


def test_strategy_wheel_update_and_get(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000001222")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000001333")
    monkeypatch.setenv("DEV_USER_EMAIL", "strategy_test@local.dev")

    workspace_id = "00000000-0000-0000-0000-000000001333"

    with TestClient(create_app()) as client:
        payload = {
            "data": [
                {"key": "health", "current": 3, "target": 7, "notes": "Важно"},
                {"key": "career", "current": 6, "target": 8},
            ]
        }
        updated = client.put(
            "/api/v1/strategy/wheel",
            params={"workspace_id": workspace_id},
            json=payload,
        )
        assert updated.status_code == 200

        fetched = client.get("/api/v1/strategy/wheel", params={"workspace_id": workspace_id})
        assert fetched.status_code == 200
        data = fetched.json().get("data", [])
        keys = {item["key"] for item in data}
        assert {"health", "career"} <= keys
