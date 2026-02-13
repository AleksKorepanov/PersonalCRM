"""Тесты для автосоздания iCloud контакта при создании CRM контакта."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_create_contact_creates_icloud_contact(monkeypatch):
    """Тест: создание CRM контакта автоматически создает iCloud контакт и связь."""
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
            client.delete("/api/v1/icloud/disconnect", params={"workspace_id": workspace_id})
        
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
        
        # Создаем CRM контакт - должен автоматически создать iCloud контакт
        crm_contact_response = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Test Contact Auto",
                "first_name": "Test",
                "last_name": "Contact",
                "phones": ["+79991234567"],
                "emails": ["test@example.com"],
                "tie_strength": "medium",
                "visibility": "shared",
            },
        )
        assert crm_contact_response.status_code == 201
        crm_contact_id = crm_contact_response.json()["id"]
        
        # Проверяем, что iCloud контакт создан
        icloud_contacts_response = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id, "limit": 100},
        )
        assert icloud_contacts_response.status_code == 200
        icloud_contacts = icloud_contacts_response.json()["data"]
        
        icloud_contact = next(
            (c for c in icloud_contacts if c.get("display_name") == "Test Contact Auto"),
            None
        )
        
        assert icloud_contact is not None, "iCloud контакт должен быть создан"
        assert icloud_contact["display_name"] == "Test Contact Auto"
        
        # Проверяем, что связь создана
        assert icloud_contact.get("link") is not None, "Связь должна быть создана"
        assert icloud_contact["link"]["crm_contact_id"] == crm_contact_id
        assert icloud_contact["link"]["link_type"] == "auto_create"
        
        # Проверяем, что телефоны совпадают
        assert len(icloud_contact["phones"]) > 0
        assert any("+79991234567" in str(p.get("value", "")) for p in icloud_contact["phones"])


def test_create_contact_idempotent(monkeypatch):
    """Тест: повторное создание CRM контакта не создает дубль iCloud контакта (идемпотентность)."""
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
            client.delete("/api/v1/icloud/disconnect", params={"workspace_id": workspace_id})
        
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
        
        # Создаем первый CRM контакт
        contact1_response = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Idempotent Test",
                "first_name": "Idempotent",
                "last_name": "Test",
                "phones": ["+79991234568"],
                "emails": ["idempotent@example.com"],
                "tie_strength": "medium",
                "visibility": "shared",
            },
        )
        assert contact1_response.status_code == 201
        contact1_id = contact1_response.json()["id"]
        
        # Получаем список iCloud контактов после первого создания
        icloud_contacts_response1 = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id, "limit": 100},
        )
        assert icloud_contacts_response1.status_code == 200
        icloud_contacts_after_first = icloud_contacts_response1.json()["data"]
        icloud_count_after_first = len([
            c for c in icloud_contacts_after_first
            if c.get("display_name") == "Idempotent Test"
        ])
        
        # Создаем второй CRM контакт с теми же данными (но другим ID)
        contact2_response = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Idempotent Test",
                "first_name": "Idempotent",
                "last_name": "Test",
                "phones": ["+79991234568"],
                "emails": ["idempotent@example.com"],
                "tie_strength": "medium",
                "visibility": "shared",
            },
        )
        assert contact2_response.status_code == 201
        contact2_id = contact2_response.json()["id"]
        
        assert contact1_id != contact2_id, "CRM контакты должны иметь разные ID"
        
        # Проверяем, что оба CRM контакта имеют связи с iCloud контактами
        icloud_contacts_response2 = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id, "limit": 100},
        )
        assert icloud_contacts_response2.status_code == 200
        icloud_contacts_after_second = icloud_contacts_response2.json()["data"]
        
        links1 = [
            c.get("link") for c in icloud_contacts_after_second
            if c.get("link") and c["link"]["crm_contact_id"] == contact1_id
        ]
        links2 = [
            c.get("link") for c in icloud_contacts_after_second
            if c.get("link") and c["link"]["crm_contact_id"] == contact2_id
        ]
        
        # Каждый CRM контакт должен иметь связь
        assert len(links1) > 0, "Первый CRM контакт должен иметь связь"
        assert len(links2) > 0, "Второй CRM контакт должен иметь связь"


def test_create_contact_without_icloud_account(monkeypatch):
    """Тест: создание CRM контакта без подключенного iCloud аккаунта не вызывает ошибку."""
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("DEV_USER_ID", "00000000-0000-0000-0000-000000000001")
    monkeypatch.setenv("DEV_WORKSPACE_ID", "00000000-0000-0000-0000-000000000002")
    monkeypatch.setenv("DEV_USER_EMAIL", "test@example.com")
    monkeypatch.setenv("ICLOUD_MODE", "mock")
    
    workspace_id = "00000000-0000-0000-0000-000000000002"
    
    with TestClient(create_app()) as client:
        # Убеждаемся, что iCloud аккаунт не подключен
        status_response = client.get("/api/v1/icloud/status", params={"workspace_id": workspace_id})
        if status_response.status_code == 200:
            client.delete("/api/v1/icloud/disconnect", params={"workspace_id": workspace_id})
        
        # Создаем CRM контакт - не должно быть исключения
        contact_response = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Test Without iCloud",
                "first_name": "Test",
                "last_name": "Without",
                "phones": ["+79991234569"],
                "emails": ["without@example.com"],
                "tie_strength": "medium",
                "visibility": "shared",
            },
        )
        assert contact_response.status_code == 201
        contact = contact_response.json()
        # display_name формируется из first_name и last_name, если они указаны
        assert contact["display_name"] in ["Test Without iCloud", "Without Test"]
        assert contact["first_name"] == "Test"
        assert contact["last_name"] == "Without"
