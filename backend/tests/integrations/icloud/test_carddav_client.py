"""Тесты для CardDAV клиента."""

import os
from unittest.mock import Mock, patch
from xml.etree import ElementTree as ET

import httpx
import pytest

from app.integrations.icloud.carddav_client import (
    AddressBook,
    CardDAVAuthError,
    CardDAVClient,
    CardDAVConnectionError,
    CardDAVError,
    CardDAVNotFoundError,
)


class TestCardDAVClient:
    """Тесты CardDAV клиента."""
    
    @pytest.fixture
    def mock_url(self):
        """Фикстура для mock URL."""
        return "http://localhost:8080"
    
    @pytest.fixture
    def client(self, mock_url):
        """Фикстура для создания клиента."""
        with patch.dict(os.environ, {"CARDDAV_MOCK_URL": mock_url}):
            return CardDAVClient(username="test@example.com", password="test-password")
    
    def test_init_with_mock_url(self, mock_url):
        """Тест инициализации с mock URL из env."""
        with patch.dict(os.environ, {"CARDDAV_MOCK_URL": mock_url}):
            client = CardDAVClient(username="test@example.com", password="test-password")
            assert client.base_url == mock_url
    
    def test_init_without_mock_url(self):
        """Тест инициализации без mock URL (используется iCloud или настройки из config)."""
        # Очищаем env и патчим настройки для использования реального iCloud
        with patch.dict(os.environ, {}, clear=True):
            from app.core.config import settings
            with patch.object(settings, 'icloud_mode', 'real'):
                client = CardDAVClient(username="test@example.com", password="test-password")
                assert client.base_url == CardDAVClient.ICLOUD_BASE_URL
    
    def test_init_with_custom_base_url(self):
        """Тест инициализации с кастомным base_url."""
        custom_url = "https://custom-carddav.example.com"
        client = CardDAVClient(
            username="test@example.com",
            password="test-password",
            base_url=custom_url,
        )
        assert client.base_url == custom_url
    
    def test_discover_success(self, client):
        """Тест успешного discovery."""
        mock_response = Mock()
        mock_response.status_code = 207
        mock_response.text = """<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/.well-known/carddav</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
        </d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/carddavhome/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <card:addressbook xmlns:card="urn:ietf:params:xml:ns:carddav"/>
        </d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"""
        
        with patch.object(client.client, 'request', return_value=mock_response):
            result = client.discover()
            assert result == "/carddavhome/"
    
    def test_discover_auth_error(self, client):
        """Тест discovery с ошибкой аутентификации."""
        mock_response = Mock()
        mock_response.status_code = 401
        
        with patch.object(client.client, 'request', return_value=mock_response):
            with pytest.raises(CardDAVAuthError):
                client.discover()
    
    def test_discover_not_found(self, client):
        """Тест discovery когда endpoint не найден."""
        mock_response = Mock()
        mock_response.status_code = 404
        
        with patch.object(client.client, 'request', return_value=mock_response):
            with patch.dict(os.environ, {"CARDDAV_MOCK_URL": "http://localhost:8080"}):
                result = client.discover()
                assert result == "/carddavhome/"
    
    def test_list_addressbooks_success(self, client):
        """Тест успешного получения списка адресных книг."""
        mock_response = Mock()
        mock_response.status_code = 207
        mock_response.text = """<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/carddavhome/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <card:addressbook/>
        </d:resourcetype>
        <d:displayname>Contacts</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/carddavhome/contact1.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"""
        
        with patch.object(client.client, 'request', return_value=mock_response):
            addressbooks = client.list_addressbooks("/carddavhome/")
            assert len(addressbooks) == 1
            assert addressbooks[0].href == "/carddavhome/"
            assert addressbooks[0].display_name == "Contacts"
    
    def test_fetch_contact_success(self, client):
        """Тест успешного получения контакта."""
        vcard_content = """BEGIN:VCARD
VERSION:3.0
FN:John Doe
TEL;TYPE=CELL:+79991234567
END:VCARD"""
        
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = vcard_content
        mock_response.headers = {"ETag": '"abc123"'}
        
        with patch.object(client.client, 'get', return_value=mock_response):
            etag, content = client.fetch_contact("contact1.vcf", "/carddavhome/")
            assert etag == "abc123"
            assert content == vcard_content
    
    def test_fetch_contact_not_found(self, client):
        """Тест получения несуществующего контакта."""
        mock_response = Mock()
        mock_response.status_code = 404
        
        with patch.object(client.client, 'get', return_value=mock_response):
            with pytest.raises(CardDAVNotFoundError):
                client.fetch_contact("nonexistent.vcf", "/carddavhome/")
    
    def test_create_contact_success(self, client):
        """Тест успешного создания контакта."""
        vcard_content = """BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
TEL;TYPE=CELL:+79997654321
END:VCARD"""
        
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.headers = {"ETag": '"def456"'}
        
        with patch.object(client.client, 'put', return_value=mock_response):
            uri, etag = client.create_contact(vcard_content, "new-contact.vcf", "/carddavhome/")
            assert uri == "new-contact.vcf"
            assert etag == "def456"
    
    def test_create_contact_conflict(self, client):
        """Тест создания контакта с конфликтом (уже существует)."""
        mock_response = Mock()
        mock_response.status_code = 409
        
        with patch.object(client.client, 'put', return_value=mock_response):
            with pytest.raises(CardDAVError) as exc_info:
                client.create_contact("BEGIN:VCARD...", "existing.vcf", "/carddavhome/")
            assert "already exists" in str(exc_info.value).lower()
    
    def test_context_manager(self, mock_url):
        """Тест использования клиента как контекстного менеджера."""
        with patch.dict(os.environ, {"CARDDAV_MOCK_URL": mock_url}):
            with CardDAVClient(username="test@example.com", password="test-password") as client:
                assert client.base_url == mock_url
                # Клиент должен закрыться автоматически
    
    def test_connection_error(self, client):
        """Тест обработки ошибки подключения."""
        with patch.object(client.client, 'request', side_effect=httpx.RequestError("Connection failed")):
            with pytest.raises(CardDAVConnectionError):
                client.discover()
    
    def test_addressbook_repr(self):
        """Тест строкового представления AddressBook."""
        ab = AddressBook(href="/carddavhome/", display_name="My Contacts")
        assert "AddressBook" in repr(ab)
        assert "/carddavhome/" in repr(ab)
        assert "My Contacts" in repr(ab)
