"""Тесты для модуля нормализации телефонных номеров."""

import pytest

from app.utils.phone_normalize import normalize_phone


class TestPhoneNormalize:
    """Тесты функции normalize_phone."""
    
    def test_russian_format_with_plus(self):
        """Российский номер с плюсом."""
        assert normalize_phone("+7 (999) 123-45-67") == "+79991234567"
        assert normalize_phone("+7 999 123 45 67") == "+79991234567"
        assert normalize_phone("+79991234567") == "+79991234567"
    
    def test_russian_format_with_8(self):
        """Российский номер начинающийся с 8."""
        assert normalize_phone("8 999 123 45 67") == "+79991234567"
        assert normalize_phone("8(999)123-45-67") == "+79991234567"
        assert normalize_phone("89991234567") == "+79991234567"
    
    def test_russian_format_with_7(self):
        """Российский номер начинающийся с 7."""
        assert normalize_phone("7 999 123 45 67") == "+79991234567"
        assert normalize_phone("79991234567") == "+79991234567"
    
    def test_russian_format_with_default_country(self):
        """Российский номер без кода страны, но с default_country."""
        assert normalize_phone("999-123-4567", default_country="RU") == "+79991234567"
        assert normalize_phone("9991234567", default_country="ru") == "+79991234567"
        assert normalize_phone("(999) 123-45-67", default_country="RU") == "+79991234567"
    
    def test_us_format_with_plus(self):
        """Американский номер с плюсом."""
        assert normalize_phone("+1 555 123 4567") == "+15551234567"
        assert normalize_phone("+1-555-123-4567") == "+15551234567"
        assert normalize_phone("+15551234567") == "+15551234567"
    
    def test_us_format_with_default_country(self):
        """Американский номер без кода страны, но с default_country."""
        assert normalize_phone("555-123-4567", default_country="US") == "+15551234567"
        assert normalize_phone("(555) 123-4567", default_country="US") == "+15551234567"
        assert normalize_phone("5551234567", default_country="us") == "+15551234567"
    
    def test_international_formats(self):
        """Международные форматы."""
        assert normalize_phone("+44 20 7946 0958") == "+442079460958"
        assert normalize_phone("+49 30 12345678") == "+493012345678"
        assert normalize_phone("+33 1 23 45 67 89") == "+33123456789"
    
    def test_invalid_numbers(self):
        """Некорректные номера должны возвращать None."""
        assert normalize_phone("") is None
        assert normalize_phone("invalid") is None
        assert normalize_phone("123") is None  # слишком короткий
        assert normalize_phone("12345") is None  # слишком короткий
        assert normalize_phone("abc-def-ghij") is None  # нет цифр
        assert normalize_phone("+") is None  # только плюс
        assert normalize_phone("+123") is None  # слишком короткий после плюса
    
    def test_edge_cases(self):
        """Граничные случаи."""
        # Номер без кода страны и без default_country должен вернуть None
        assert normalize_phone("9991234567") is None
        assert normalize_phone("5551234567") is None
        
        # Номер с пробелами и спецсимволами
        assert normalize_phone("  +7 (999) 123-45-67  ") == "+79991234567"
        assert normalize_phone("+7-999-123-45-67") == "+79991234567"
        
        # None и не-строки
        assert normalize_phone(None) is None
        assert normalize_phone(1234567890) is None
    
    def test_different_country_codes(self):
        """Разные коды стран с default_country."""
        assert normalize_phone("20 7946 0958", default_country="GB") == "+442079460958"
        assert normalize_phone("30 12345678", default_country="DE") == "+493012345678"
        # Французский номер (10 цифр после очистки)
        assert normalize_phone("1 23 45 67 89 0", default_country="FR") == "+331234567890"
        
        # Регион в нижнем регистре
        assert normalize_phone("9991234567", default_country="ru") == "+79991234567"
        assert normalize_phone("5551234567", default_country="us") == "+15551234567"
