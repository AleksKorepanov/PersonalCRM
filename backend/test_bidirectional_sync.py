#!/usr/bin/env python3
"""Тестовый скрипт для проверки двусторонней синхронизации с iCloud.

Создает тестовый контакт в CRM, который автоматически синхронизируется с iCloud.
Затем можно проверить синхронизацию в обратную сторону через интерфейс iPhone.
"""

import subprocess
import json
import sys
import time

API_BASE_URL = "http://localhost:8000"
WORKSPACE_ID = "00000000-0000-0000-0000-000000000002"

def run_curl(command):
    """Выполняет curl команду и возвращает результат."""
    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True
    )
    return result

def create_test_contact():
    """Создает тестовый контакт в CRM."""
    import uuid
    test_id = str(uuid.uuid4())[:8]
    
    contact_data = {
        "first_name": "Тест",
        "last_name": f"Синхронизации-{test_id}",
        "display_name": f"Тест Синхронизации {test_id}",
        "phones": [f"+7 (999) {test_id[:3]}-{test_id[3:5]}-{test_id[5:8]}"],
        "emails": [f"sync-test-{test_id}@example.com"],
        "job_title": "Тестировщик синхронизации",
        "tie_strength": "medium",
        "visibility": "shared",
        "tags": []
    }
    
    print("=" * 60)
    print("Создание тестового контакта для проверки синхронизации")
    print("=" * 60)
    print(f"\nДанные контакта:")
    print(f"  Имя: {contact_data['display_name']}")
    print(f"  Телефон: {contact_data['phones'][0]}")
    print(f"  Email: {contact_data['emails'][0]}")
    
    curl_cmd = f"""curl -s -X POST "{API_BASE_URL}/api/v1/contacts?workspace_id={WORKSPACE_ID}" \\
      -H "Content-Type: application/json" \\
      -d '{json.dumps(contact_data, ensure_ascii=False)}'"""
    
    result = run_curl(curl_cmd)
    
    if result.returncode != 0:
        print(f"\n❌ Ошибка создания контакта:")
        print(result.stderr)
        return None
    
    try:
        contact = json.loads(result.stdout)
        contact_id = contact.get('id')
        print(f"\n✅ Контакт успешно создан в CRM!")
        print(f"   ID: {contact_id}")
        return contact_id
    except json.JSONDecodeError:
        print(f"\n❌ Ошибка парсинга ответа:")
        print(result.stdout)
        return None

def check_icloud_sync(contact_id):
    """Проверяет, синхронизировался ли контакт с iCloud."""
    print(f"\nПроверка синхронизации с iCloud...")
    time.sleep(2)  # Даем время на синхронизацию
    
    # Проверяем через БД
    check_cmd = f"""docker compose exec -T postgres psql -U personalcrm -d personalcrm -c \\
      "SELECT c.id, c.display_name, ic.id as icloud_id, ic.remote_uri, ic.display_name as icloud_display_name 
       FROM contacts c 
       LEFT JOIN icloud_contact_links l ON l.contact_id = c.id 
       LEFT JOIN icloud_contacts ic ON ic.id = l.icloud_contact_id 
       WHERE c.id = '{contact_id}';" """
    
    result = run_curl(check_cmd)
    
    if result.returncode == 0:
        output = result.stdout
        if "icloud_id" in output and "|" in output:
            lines = output.strip().split('\n')
            if len(lines) >= 3:
                data_line = lines[2]
                parts = [p.strip() for p in data_line.split('|')]
                if len(parts) >= 5:
                    icloud_id = parts[2].strip()
                    remote_uri = parts[3].strip()
                    icloud_display_name = parts[4].strip()
                    
                    if icloud_id and icloud_id != '':
                        print(f"✅ Контакт синхронизирован с iCloud!")
                        print(f"   iCloud ID: {icloud_id}")
                        print(f"   Remote URI: {remote_uri}")
                        print(f"   iCloud Display Name: {icloud_display_name}")
                        return True
                    else:
                        print(f"⚠️  Контакт создан в CRM, но еще не синхронизирован с iCloud")
                        print(f"   Проверьте логи: docker compose logs backend | grep -i 'create_icloud'")
                        return False
    
    print(f"⚠️  Не удалось проверить синхронизацию")
    return False

def main():
    print("\n" + "=" * 60)
    print("Тест двусторонней синхронизации с iCloud")
    print("=" * 60)
    
    # Создаем контакт
    contact_id = create_test_contact()
    
    if not contact_id:
        print("\n❌ Не удалось создать контакт")
        sys.exit(1)
    
    # Проверяем синхронизацию
    synced = check_icloud_sync(contact_id)
    
    print("\n" + "=" * 60)
    if synced:
        print("✅ Тест завершен успешно!")
        print("=" * 60)
        print("\nСледующие шаги для проверки обратной синхронизации:")
        print("  1. Откройте приложение Контакты на iPhone")
        print("  2. Найдите созданный контакт")
        print("  3. Отредактируйте его (например, измените телефон или email)")
        print("  4. Выполните синхронизацию через интерфейс iPhone в CRM")
        print("  5. Проверьте, что изменения появились в CRM")
    else:
        print("⚠️  Контакт создан, но синхронизация требует проверки")
        print("=" * 60)
        print("\nПроверьте:")
        print("  1. Логи бэкенда: docker compose logs backend | grep -i 'icloud'")
        print("  2. Что iCloud аккаунт подключен в настройках")
        print("  3. Что пароль приложения настроен правильно")
    
    print(f"\nID созданного контакта: {contact_id}")
    print("=" * 60)

if __name__ == "__main__":
    main()
