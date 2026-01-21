from fastapi.testclient import TestClient

from app.main import create_app


def test_health_ok(monkeypatch):
    monkeypatch.setenv("DISABLE_DB", "1")
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.text == "ok"
