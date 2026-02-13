"""Модуль нормализации телефонных номеров для связывания CRM ↔ iCloud контактов.

Нормализует телефонные номера к формату E.164 (+XXXXXXXXXXXX) для обеспечения
консистентного сравнения и связывания контактов между системами.
"""

from __future__ import annotations

import re
from typing import Optional


# Коды стран для нормализации (основные)
COUNTRY_CODES = {
    "RU": "+7",   # Россия
    "US": "+1",   # США
    "GB": "+44",  # Великобритания
    "DE": "+49",  # Германия
    "FR": "+33",  # Франция
    "IT": "+39",  # Италия
    "ES": "+34",  # Испания
    "CN": "+86",  # Китай
    "JP": "+81",  # Япония
    "IN": "+91",  # Индия
    "BR": "+55",  # Бразилия
    "AU": "+61",  # Австралия
    "CA": "+1",   # Канада
    "MX": "+52",  # Мексика
    "KR": "+82",  # Южная Корея
}

# Маппинг для определения страны по workspace (можно расширить)
DEFAULT_COUNTRY_BY_REGION = {
    "ru": "RU",
    "us": "US",
    "gb": "GB",
    "uk": "GB",
    "de": "DE",
    "fr": "FR",
    "it": "IT",
    "es": "ES",
    "cn": "CN",
    "jp": "JP",
    "in": "IN",
    "br": "BR",
    "au": "AU",
    "ca": "CA",
    "mx": "MX",
    "kr": "KR",
}


def normalize_phone(raw: str, default_country: Optional[str] = None) -> Optional[str]:
    """Нормализует телефонный номер к формату E.164 (+XXXXXXXXXXXX).
    
    Алгоритм:
    1. Удаляет все нецифровые символы кроме '+'
    2. Если номер начинается с '+' — оставляет как есть
    3. Если номер без '+' и начинается с '8' (Россия) — заменяет на '+7'
    4. Если номер без '+' и начинается с '7' — добавляет '+'
    5. Если номер без '+' и default_country указан — добавляет код страны
    6. Если номер без '+' и длина < 10 — возвращает None (некорректный)
    7. Проверяет минимальную длину (10 цифр без кода страны)
    
    Args:
        raw: Сырой телефонный номер в любом формате
        default_country: Код страны по умолчанию (например, 'RU', 'US') или None
        
    Returns:
        Нормализованный номер в формате E.164 (например, '+79991234567') или None,
        если номер нельзя нормализовать
        
    Examples:
        >>> normalize_phone("+7 (999) 123-45-67")
        '+79991234567'
        >>> normalize_phone("8 999 123 45 67", default_country="RU")
        '+79991234567'
        >>> normalize_phone("999-123-4567", default_country="RU")
        '+79991234567'
        >>> normalize_phone("+1 555 123 4567")
        '+15551234567'
        >>> normalize_phone("invalid")
        None
    """
    if not raw or not isinstance(raw, str):
        return None
    
    # Удаляем все пробелы, скобки, дефисы и другие нецифровые символы кроме '+'
    cleaned = re.sub(r'[^\d+]', '', raw.strip())
    
    if not cleaned:
        return None
    
    # Если номер начинается с '+', оставляем как есть
    if cleaned.startswith('+'):
        # Убираем '+' для проверки
        digits = cleaned[1:]
        if not digits or not digits.isdigit():
            return None
        # Проверяем минимальную длину (минимум 10 цифр для полного номера)
        if len(digits) < 10:
            return None
        return '+' + digits
    
    # Если номер без '+', проверяем начало
    if not cleaned.isdigit():
        return None
    
    # Если номер начинается с '8' (российский формат) — заменяем на '+7'
    if cleaned.startswith('8') and len(cleaned) >= 11:
        # Убираем первую '8' и добавляем '+7'
        digits = cleaned[1:]
        if len(digits) < 10:
            return None
        return '+7' + digits
    
    # Если номер начинается с '7' и длина >= 11 — добавляем '+'
    if cleaned.startswith('7') and len(cleaned) >= 11:
        return '+' + cleaned
    
    # Если default_country указан, пытаемся добавить код страны
    if default_country:
        country_code = None
        
        # Если передан полный код страны (например, 'RU')
        if default_country.upper() in COUNTRY_CODES:
            country_code = COUNTRY_CODES[default_country.upper()]
        # Если передан регион (например, 'ru')
        elif default_country.lower() in DEFAULT_COUNTRY_BY_REGION:
            country_code = COUNTRY_CODES[DEFAULT_COUNTRY_BY_REGION[default_country.lower()]]
        
        if country_code:
            # Убираем '+' из country_code если есть
            code_digits = country_code[1:] if country_code.startswith('+') else country_code
            # Проверяем, что номер не начинается с кода страны (чтобы не дублировать)
            if not cleaned.startswith(code_digits):
                # Проверяем минимальную длину (10 цифр для местного номера)
                if len(cleaned) >= 10:
                    return country_code + cleaned
    
    # Если номер длиной >= 10 цифр без кода страны, но нет default_country
    # Возвращаем None, так как не можем определить код страны
    if len(cleaned) < 10:
        return None
    
    # Если номер >= 10 цифр, но нет кода страны и нет default_country
    # Возвращаем None для безопасности (избегаем ложных совпадений)
    return None
