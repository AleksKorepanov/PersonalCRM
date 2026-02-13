#!/usr/bin/env python3
"""Тестовый скрипт для создания контакта в CRM и проверки синхронизации с iCloud."""

import requests
import json
import sys
import os

# Настройки
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
WORKSPACE_ID = os.getenv("WORKSPACE_ID", "00000000-0000-0000-0000-000000000002")  # Из .env или seed данных

def create_test_contact():
    """Создает тестовый контакт в CRM."""
    
    # Данные тестового контакта
    contact_data = {
        "first_name": "Тестовый",
        "last_name": "Контакт",
        "display_name": "Тестовый Контакт",
        "phones": ["+7 (999) 123-45-67"],
        "emails": ["test@example.com"],
        "company": "Тестовая Компания",
        "job_title": "Тестировщик",
        "tie_strength": "medium",
        "visibility": "shared",
        "tags": []
    }
    
    print(f"Создаю тестовый контакт в CRM...")
    print(f"Данные: {json.dumps(contact_data, indent=2, ensure_ascii=False)}")
    
    try:
        # Создаем контакт через API
        response = requests.post(
            f"{API_BASE_URL}/api/v1/contacts",
            params={"workspace_id": WORKSPACE_ID},
            json=contact_data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 201:
            contact = response.json()
            print(f"\n✅ Контакт успешно создан в CRM!")
            print(f"ID контакта: {contact.get('id')}")
            print(f"Имя: {contact.get('display_name')}")
            
            # Проверяем, создался ли контакт в iCloud
            print(f"\nПроверяю синхронизацию с iCloud...")
            check_icloud_sync(contact.get('id'))
            
            return contact
        else:
            print(f"\n❌ Ошибка создания контакта: {response.status_code}")
            print(f"Ответ: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"\n❌ Ошибка подключения к API: {e}")
        print(f"Убедитесь, что бэкенд запущен на {API_BASE_URL}")
        return None

def check_icloud_sync(contact_id):
    """Проверяет, синхронизировался ли контакт с iCloud."""
    try:
        # Получаем список iCloud контактов
        response = requests.get(
            f"{API_BASE_URL}/api/v1/icloud/contacts",
            params={"workspace_id": WORKSPACE_ID, "limit": 100},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            contacts = data.get("data", [])
            
            # Ищем контакт по телефону или email
            test_phone = "+79991234567"  # Нормализованный формат
            test_email = "test@example.com"
            
            found = False
            for icloud_contact in contacts:
                phones = [p.get("value", "") for p in icloud_contact.get("phones", [])]
                emails = [e.get("value", "") for e in icloud_contact.get("emails", [])]
                
                if test_phone in phones or test_email.lower() in [e.lower() for e in emails]:
                    print(f"✅ Контакт найден в iCloud!")
                    print(f"   iCloud ID: {icloud_contact.get('id')}")
                    print(f"   Имя: {icloud_contact.get('display_name')}")
                    print(f"   Телефоны: {phones}")
                    print(f"   Emails: {emails}")
                    found = True
                    break
            
            if not found:
                print(f"⚠️  Контакт не найден в iCloud контактах")
                print(f"   Всего iCloud контактов: {len(contacts)}")
                print(f"   Попробуйте выполнить синхронизацию вручную через интерфейс iPhone")
        else:
            print(f"⚠️  Не удалось проверить iCloud контакты: {response.status_code}")
            
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Ошибка при проверке iCloud: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("Тест создания контакта и синхронизации с iCloud")
    print("=" * 60)
    
    contact = create_test_contact()
    
    if contact:
        print("\n" + "=" * 60)
        print("✅ Тест завершен успешно!")
        print("=" * 60)
        print(f"\nСозданный контакт:")
        print(f"  ID: {contact.get('id')}")
        print(f"  Имя: {contact.get('display_name')}")
        print(f"  Телефон: {contact.get('phones', [])}")
        print(f"  Email: {contact.get('emails', [])}")
        print(f"\nПроверьте синхронизацию:")
        print(f"  1. Выполните синхронизацию через интерфейс iPhone")
        print(f"  2. Проверьте, что контакт появился в iCloud")
        print(f"  3. Проверьте, что контакт отображается на странице iPhone")
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("❌ Тест завершен с ошибками")
        print("=" * 60)
        sys.exit(1)
