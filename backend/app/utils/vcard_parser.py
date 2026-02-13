"""Парсер vCard для извлечения нормализованных данных контакта."""

from __future__ import annotations

import re
from typing import Dict, List, Optional
from urllib.parse import unquote

from app.utils.phone_normalize import normalize_phone


def parse_vcard(vcard_content: str) -> Dict:
    """Парсит vCard и возвращает нормализованные данные.
    
    Args:
        vcard_content: Содержимое vCard в формате vCard 3.0/4.0
        
    Returns:
        Словарь с нормализованными полями:
        - display_name
        - structured_name (given_name, middle_name, family_name)
        - company
        - job_title
        - department
        - phones (список с label, value, is_primary)
        - emails (список с label, value, is_primary)
    """
    result = {
        "display_name": None,
        "structured_name": {
            "given_name": None,
            "middle_name": None,
            "family_name": None,
            "prefix": None,
            "suffix": None,
        },
        "company": None,
        "job_title": None,
        "department": None,
        "phones": [],
        "emails": [],
        "addresses": [],
        "urls": [],
        "ims": [],
        "dates": [],
        "notes": None,
    }
    
    lines = vcard_content.split('\n')
    current_line = ""
    
    for line in lines:
        # Обработка продолжения строк (начинается с пробела или табуляции)
        if line.startswith(' ') or line.startswith('\t'):
            current_line += line[1:]
            continue
        
        if current_line:
            _process_vcard_line(current_line.strip(), result)
        current_line = line
    
    if current_line:
        _process_vcard_line(current_line.strip(), result)
    
    return result


def _process_vcard_line(line: str, result: Dict) -> None:
    """Обрабатывает одну строку vCard."""
    if not line or line.startswith('BEGIN:') or line.startswith('END:'):
        return
    
    # Разделяем на имя свойства и значение
    parts = line.split(':', 1)
    if len(parts) != 2:
        return
    
    prop_name = parts[0].upper()
    value = parts[1].strip()
    
    # Декодируем значение (может быть закодировано)
    value = unquote(value.replace('\\,', ',').replace('\\;', ';').replace('\\n', '\n'))
    
    # FN - отображаемое имя
    if prop_name == 'FN':
        result["display_name"] = value
    
    # N - структурированное имя
    elif prop_name == 'N':
        parts = value.split(';')
        if len(parts) >= 1:
            result["structured_name"]["family_name"] = parts[0] if parts[0] else None
        if len(parts) >= 2:
            result["structured_name"]["given_name"] = parts[1] if parts[1] else None
        if len(parts) >= 3:
            result["structured_name"]["middle_name"] = parts[2] if parts[2] else None
        if len(parts) >= 4:
            result["structured_name"]["prefix"] = parts[3] if parts[3] else None
        if len(parts) >= 5:
            result["structured_name"]["suffix"] = parts[4] if parts[4] else None
    
    # ORG - организация
    elif prop_name.startswith('ORG'):
        org_parts = value.split(';')
        if org_parts:
            result["company"] = org_parts[0] if org_parts[0] else None
            if len(org_parts) > 1:
                result["department"] = org_parts[1] if org_parts[1] else None
    
    # TITLE - должность
    elif prop_name == 'TITLE':
        result["job_title"] = value
    
    # TEL - телефон
    elif prop_name.startswith('TEL'):
        phone = _parse_phone_line(prop_name, value)
        if phone:
            result["phones"].append(phone)
    
    # EMAIL - email
    elif prop_name.startswith('EMAIL'):
        email = _parse_email_line(prop_name, value)
        if email:
            result["emails"].append(email)
    
    # ADR - адрес
    elif prop_name.startswith('ADR'):
        address = _parse_address_line(prop_name, value)
        if address:
            result["addresses"].append(address)
    
    # URL - URL адрес
    elif prop_name.startswith('URL'):
        url = _parse_url_line(prop_name, value)
        if url:
            result["urls"].append(url)
    
    # IMPP/X-SOCIALPROFILE - мессенджеры/социальные профили
    elif prop_name.startswith('IMPP') or prop_name.startswith('X-SOCIALPROFILE'):
        im = _parse_im_line(prop_name, value)
        if im:
            result["ims"].append(im)
    
    # BDAY/ANNIVERSARY - даты
    elif prop_name.startswith('BDAY') or prop_name.startswith('ANNIVERSARY') or prop_name.startswith('X-'):
        if prop_name.startswith('BDAY') or prop_name.startswith('ANNIVERSARY') or 'DATE' in prop_name.upper():
            date = _parse_date_line(prop_name, value)
            if date:
                result["dates"].append(date)
    
    # NOTE - заметки
    elif prop_name == 'NOTE':
        result["notes"] = value


def _parse_phone_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку телефона из vCard."""
    # Извлекаем параметры из имени свойства (TYPE=CELL;TYPE=VOICE и т.д.)
    params = {}
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE':
                    params['label'] = val.lower()
                elif key.upper() == 'PREF':
                    params['is_primary'] = True
    
    # Нормализуем телефон
    normalized = normalize_phone(value)
    
    return {
        "label": params.get('label'),
        "value": value,  # Сохраняем оригинальное значение
        "is_primary": params.get('is_primary', False),
    }


def _parse_email_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку email из vCard."""
    # Извлекаем параметры
    params = {}
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE':
                    params['label'] = val.lower()
                elif key.upper() == 'PREF':
                    params['is_primary'] = True
    
    return {
        "label": params.get('label'),
        "value": value.lower().strip(),  # Нормализуем email
        "is_primary": params.get('is_primary', False),
    }


def _parse_address_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку адреса из vCard."""
    # Извлекаем параметры
    params = {}
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE':
                    params['label'] = val.lower()
    
    # Формат адреса: PO Box; Extended Address; Street; City; State; Postal Code; Country
    parts = value.split(';')
    return {
        "label": params.get('label'),
        "street": parts[2].strip() if len(parts) > 2 else None,
        "city": parts[3].strip() if len(parts) > 3 else None,
        "region": parts[4].strip() if len(parts) > 4 else None,
        "postal_code": parts[5].strip() if len(parts) > 5 else None,
        "country": parts[6].strip() if len(parts) > 6 else None,
    }


def _parse_url_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку URL из vCard."""
    # Извлекаем параметры
    params = {}
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE':
                    params['label'] = val.lower()
    
    return {
        "label": params.get('label'),
        "value": value.strip(),
    }


def _parse_im_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку мессенджера/социального профиля из vCard."""
    # Извлекаем параметры
    params = {}
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE' or key.upper() == 'X-SERVICE':
                    params['service'] = val.lower()
                elif key.upper() == 'X-LABEL':
                    params['label'] = val.lower()
    
    # Для IMPP значение может быть в формате xmpp:username или просто URL
    username = value.strip()
    if ':' in username:
        username = username.split(':', 1)[1]
    
    return {
        "label": params.get('label'),
        "service": params.get('service'),
        "username": username,
    }


def _parse_date_line(prop_name: str, value: str) -> Optional[Dict]:
    """Парсит строку даты из vCard."""
    # Извлекаем параметры
    params = {}
    label = None
    
    if ';' in prop_name:
        param_part = prop_name.split(';', 1)[1]
        for param in param_part.split(';'):
            if '=' in param:
                key, val = param.split('=', 1)
                if key.upper() == 'TYPE':
                    label = val.lower()
                elif key.upper() == 'VALUE':
                    # Может быть DATE или DATE-TIME
                    pass
    
    # Определяем тип даты по имени свойства
    if prop_name.startswith('BDAY'):
        label = 'birthday'
    elif prop_name.startswith('ANNIVERSARY'):
        label = 'anniversary'
    
    # Парсим дату (может быть в формате YYYY-MM-DD или YYYYMMDD)
    date_str = value.strip()
    if len(date_str) == 8 and date_str.isdigit():
        # Формат YYYYMMDD
        date_str = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    
    return {
        "label": label,
        "date": date_str,
    }
