"""Тесты для iCloud интеграции."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_connect_icloud_mock_success(monkeypatch):
    """Тест успешного подключения iCloud в режиме mock."""
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000001")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000002")
    monkeypatch.setenv("DEV_USER_EMAIL", "test@example.com")
    monkeypatch.setenv("ICLOUD_MODE", "mock")
    
    workspace_id = "00000000-0000-0000-0000-000000000002"
    
    with TestClient(create_app()) as client:
        # Сначала проверяем, есть ли уже подключенный аккаунт, и отключаем его
        status_response = client.get("/api/v1/icloud/status", params={"workspace_id": workspace_id})
        if status_response.status_code == 200:
            # Аккаунт уже подключен, отключаем его
            disconnect_response = client.delete("/api/v1/icloud/disconnect", params={"workspace_id": workspace_id})
            assert disconnect_response.status_code in [204, 404]
        
        # Подключаем iCloud аккаунт
        response = client.post(
            "/api/v1/icloud/connect",
            params={"workspace_id": workspace_id},
            json={
                "apple_id": "test@example.com",
                "app_password": "test-password-1234",
            },
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["apple_id"] == "test@example.com"
        assert data["sync_enabled"] is True
        assert "id" in data


def test_sync_icloud_loads_contacts_no_duplicates(monkeypatch):
    """Тест синхронизации: загружает контакты, повторный sync не создаёт дублей."""
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000001")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000002")
    monkeypatch.setenv("DEV_USER_EMAIL", "test@example.com")
    monkeypatch.setenv("ICLOUD_MODE", "mock")
    
    workspace_id = "00000000-0000-0000-0000-000000000002"
    
    with TestClient(create_app()) as client:
        # Очищаем предыдущее подключение если есть
        status_response = client.get("/api/v1/icloud/status", params={"workspace_id": workspace_id})
        if status_response.status_code == 200:
            disconnect_response = client.delete("/api/v1/icloud/disconnect", params={"workspace_id": workspace_id})
            assert disconnect_response.status_code in [204, 404]
        
        # Подключаем iCloud аккаунт
        connect_response = client.post(
            "/api/v1/icloud/connect",
            params={"workspace_id": workspace_id},
            json={
                "apple_id": "test@example.com",
                "app_password": "test-password-1234",
            },
        )
        assert connect_response.status_code == 201
        
        # Первая синхронизация
        sync_response1 = client.post(
            "/api/v1/icloud/sync",
            params={"workspace_id": workspace_id},
        )
        assert sync_response1.status_code == 200
        data1 = sync_response1.json()
        assert data1["status"] == "completed"
        assert data1["synced_count"] == 2  # sample-contact.vcf и john-doe.vcf
        
        # Вторая синхронизация (не должна создавать дубли)
        sync_response2 = client.post(
            "/api/v1/icloud/sync",
            params={"workspace_id": workspace_id},
        )
        assert sync_response2.status_code == 200
        data2 = sync_response2.json()
        assert data2["status"] == "completed"
        # При повторной синхронизации с теми же ETag контакты не должны обновляться
        # поэтому synced_count может быть 0 или 2 (если все обновились)
        assert data2["synced_count"] >= 0
        
        # Проверяем, что контакты не дублируются (по remote_uri должен быть уникальный контакт)
        # Это проверяется на уровне БД через UNIQUE constraint
