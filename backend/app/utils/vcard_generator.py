"""Генератор vCard из данных CRM контакта."""

from __future__ import annotations

from typing import Dict, List, Optional
from urllib.parse import quote
from uuid import uuid4


def generate_vcard(contact_data: Dict) -> str:
    """Генерирует vCard 3.0 из данных CRM контакта.
    
    Args:
        contact_data: Словарь с данными контакта:
            - id: str (UUID контакта, используется для UID если есть)
            - display_name: str (обязательно)
            - first_name: Optional[str]
            - last_name: Optional[str]
            - middle_name: Optional[str]
            - company: Optional[str]
            - job_title: Optional[str]
            - phones: List[str]
            - emails: List[str]
            - organization: Optional[Dict] с полем name
            
    Returns:
        Строка vCard в формате vCard 3.0
    """
    lines = ["BEGIN:VCARD", "VERSION:3.0"]
    
    # UID - обязательное поле для iCloud
    contact_id = contact_data.get("id")
    if contact_id:
        # Используем UUID контакта как UID
        uid = contact_id
    else:
        # Генерируем новый UUID если ID нет
        uid = str(uuid4())
    lines.append(f"UID:{uid}")
    
    # FN - отображаемое имя (обязательно)
    display_name = contact_data.get("display_name") or ""
    if not display_name:
        # Формируем из имени
        first_name = contact_data.get("first_name") or ""
        last_name = contact_data.get("last_name") or ""
        display_name = f"{first_name} {last_name}".strip() or "Без имени"
    lines.append(f"FN:{_escape_vcard_value(display_name)}")
    
    # N - структурированное имя (обязательно)
    family_name = contact_data.get("last_name") or ""
    given_name = contact_data.get("first_name") or ""
    middle_name = contact_data.get("middle_name") or ""
    additional_name = ""
    name_prefix = ""
    name_suffix = ""
    # Формат: N:family_name;given_name;middle_name;prefix;suffix
    n_value = f"{family_name};{given_name};{middle_name};{name_prefix};{name_suffix}"
    lines.append(f"N:{n_value}")
    
    # ORG - организация
    company = contact_data.get("company")
    if not company and contact_data.get("organization"):
        company = contact_data.get("organization", {}).get("name")
    if company:
        org_value = _escape_vcard_value(company)
        # Можем добавить департамент, но пока не сохраняем его в CRM
        lines.append(f"ORG:{org_value}")
    
    # TITLE - должность
    job_title = contact_data.get("job_title")
    if job_title:
        lines.append(f"TITLE:{_escape_vcard_value(job_title)}")
    
    # TEL - телефоны
    phones = contact_data.get("phones", [])
    if isinstance(phones, str):
        # Если это JSON строка, нужно распарсить
        import json
        try:
            phones = json.loads(phones) if phones else []
        except:
            phones = [phones] if phones else []
    
    for idx, phone in enumerate(phones):
        if phone:
            # Первый телефон помечаем как основной
            if idx == 0:
                lines.append(f"TEL;TYPE=CELL,VOICE;PREF=1:{_escape_vcard_value(phone)}")
            else:
                lines.append(f"TEL;TYPE=CELL,VOICE:{_escape_vcard_value(phone)}")
    
    # EMAIL - email адреса
    emails = contact_data.get("emails", [])
    if isinstance(emails, str):
        # Если это JSON строка, нужно распарсить
        import json
        try:
            emails = json.loads(emails) if emails else []
        except:
            emails = [emails] if emails else []
    
    for idx, email in enumerate(emails):
        if email:
            # Первый email помечаем как основной
            if idx == 0:
                lines.append(f"EMAIL;TYPE=INTERNET;PREF=1:{_escape_vcard_value(email)}")
            else:
                lines.append(f"EMAIL;TYPE=INTERNET:{_escape_vcard_value(email)}")
    
    # NOTE - заметки (если есть)
    notes = []
    if contact_data.get("shared_notes"):
        notes.append(contact_data["shared_notes"])
    if contact_data.get("private_notes"):
        notes.append(contact_data["private_notes"])
    if notes:
        note_text = "\n".join(notes)
        lines.append(f"NOTE:{_escape_vcard_value(note_text)}")
    
    lines.append("END:VCARD")
    
    return "\r\n".join(lines) + "\r\n"


def _escape_vcard_value(value: str) -> str:
    """Экранирует специальные символы в значении vCard.
    
    Специальные символы: , ; \n
    """
    if not value:
        return ""
    # Заменяем специальные символы
    value = value.replace("\\", "\\\\")
    value = value.replace(",", "\\,")
    value = value.replace(";", "\\;")
    value = value.replace("\n", "\\n")
    return value
