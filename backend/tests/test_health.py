from fastapi.testclient import TestClient

from app.main import create_app


def test_health_ok(monkeypatch):
    monkeypatch.setenv("DISABLE_DB", "1")
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers.get("X-Request-Id")


def test_health_db_ok(monkeypatch):
    monkeypatch.setenv("DISABLE_DB", "0")
    with TestClient(create_app()) as client:
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"
