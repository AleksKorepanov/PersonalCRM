from fastapi.testclient import TestClient

from app.main import create_app


def test_cors_preflight():
    with TestClient(create_app()) as client:
        response = client.options(
            "/api/v1/contacts",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code in (200, 204)
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_rate_limit_exceeded(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/health").status_code == 200
        response = client.get("/health")
        assert response.status_code == 429
        detail = response.json().get("detail") or {}
        assert detail.get("message") == "Слишком много запросов"
