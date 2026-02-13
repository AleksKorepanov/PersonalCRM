"""Тесты для связывания iCloud контактов с CRM контактами."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


def test_auto_link_one_to_one_match(monkeypatch):
    """Тест автоматического связывания при 1:1 совпадении по телефону."""
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
        
        # Создаём CRM контакт с телефоном +79991234567 (совпадает с sample-contact.vcf)
        # Сначала создаём CRM контакт, чтобы он был в БД при синхронизации
        crm_contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Иванов",
                "phones": ["+7 (999) 123-45-67"],
                "tie_strength": "medium",
            },
        )
        assert crm_contact.status_code == 201
        crm_contact_id = crm_contact.json()["id"]
        
        # Синхронизируем iCloud контакты - auto-link должен сработать
        sync_response = client.post(
            "/api/v1/icloud/sync",
            params={"workspace_id": workspace_id},
        )
        assert sync_response.status_code == 200
        
        # Проверяем, что связь создана автоматически
        # Получаем список iCloud контактов
        contacts_response = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id},
        )
        assert contacts_response.status_code == 200
        contacts = contacts_response.json()["data"]
        
        # Находим контакт sample-contact.vcf (с телефоном +79991234567)
        sample_contact = None
        for contact in contacts:
            if contact["remote_uri"] == "sample-contact.vcf":
                sample_contact = contact
                break
        
        assert sample_contact is not None
        assert sample_contact["link"] is not None
        assert sample_contact["link"]["crm_contact_id"] == crm_contact_id
        assert sample_contact["link"]["link_type"] == "phone_match"
        assert sample_contact["link"]["matched_phone_norm"] == "+79991234567"


def test_auto_link_one_to_many_no_link(monkeypatch):
    """Тест: при 1:many совпадении автоматическое связывание не выполняется."""
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
        
        # Создаём два CRM контакта с одинаковым телефоном +79991234567
        crm_contact1 = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Иванов 1",
                "phones": ["+7 (999) 123-45-67"],
                "tie_strength": "medium",
            },
        )
        assert crm_contact1.status_code == 201
        
        crm_contact2 = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Иван Иванов 2",
                "phones": ["+79991234567"],  # Тот же телефон, другой формат
                "tie_strength": "medium",
            },
        )
        assert crm_contact2.status_code == 201
        
        # Синхронизируем iCloud контакты
        sync_response = client.post(
            "/api/v1/icloud/sync",
            params={"workspace_id": workspace_id},
        )
        assert sync_response.status_code == 200
        
        # Проверяем, что автоматическая связь НЕ создана
        # (при 1:many не должно быть auto-link)
        contacts_response = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id},
        )
        assert contacts_response.status_code == 200
        contacts = contacts_response.json()["data"]
        
        # Находим контакт sample-contact.vcf
        sample_contact = None
        for contact in contacts:
            if contact["remote_uri"] == "sample-contact.vcf":
                sample_contact = contact
                break
        
        assert sample_contact is not None
        # При 1:many совпадении связь не должна быть создана автоматически
        assert sample_contact["link"] is None


def test_manual_link_works(monkeypatch):
    """Тест ручного связывания работает."""
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
        
        # Создаём CRM контакт
        crm_contact = client.post(
            "/api/v1/contacts",
            params={"workspace_id": workspace_id},
            json={
                "display_name": "Тестовый контакт",
                "phones": ["+79998887766"],
                "tie_strength": "medium",
            },
        )
        assert crm_contact.status_code == 201
        crm_contact_id = crm_contact.json()["id"]
        
        # Синхронизируем iCloud контакты
        sync_response = client.post(
            "/api/v1/icloud/sync",
            params={"workspace_id": workspace_id},
        )
        assert sync_response.status_code == 200
        
        # Получаем ID iCloud контакта (sample-contact.vcf)
        # Для этого нужно получить список iCloud контактов или использовать известный ID
        # Пока используем прямой запрос к БД через сервис или добавляем endpoint для получения списка
        # Для теста используем упрощённый подход: получаем первый синхронизированный контакт
        
        # Получаем список iCloud контактов
        contacts_response = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id},
        )
        assert contacts_response.status_code == 200
        contacts = contacts_response.json()["data"]
        assert len(contacts) > 0
        
        # Берём первый контакт
        icloud_contact_id = contacts[0]["id"]
        
        # Ручное связывание через endpoint
        link_response = client.post(
            f"/api/v1/icloud/contacts/{icloud_contact_id}/link",
            params={"workspace_id": workspace_id},
            json={
                "crm_contact_id": crm_contact_id,
                "link_type": "manual",
            },
        )
        assert link_response.status_code in [200, 201]
        link_data = link_response.json()
        assert link_data["crm_contact_id"] == crm_contact_id
        assert link_data["icloud_contact_id"] == icloud_contact_id
        assert link_data["link_type"] == "manual"
        assert link_data["link_status"] == "active"
        
        # Проверяем, что связь отображается в списке контактов
        contacts_response2 = client.get(
            "/api/v1/icloud/contacts",
            params={"workspace_id": workspace_id},
        )
        assert contacts_response2.status_code == 200
        contacts2 = contacts_response2.json()["data"]
        linked_contact = next((c for c in contacts2 if c["id"] == icloud_contact_id), None)
        assert linked_contact is not None
        assert linked_contact["link"] is not None
        assert linked_contact["link"]["crm_contact_id"] == crm_contact_id
