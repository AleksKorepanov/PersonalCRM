"""CardDAV клиент для работы с iCloud Contacts.

Реализует чистый интерфейс для работы с CardDAV сервером:
- Discovery CardDAV endpoint
- Получение списка адресных книг
- Получение контактов (vCard)
- Создание/обновление контактов

Поддерживает работу с mock CardDAV сервером через переменную окружения.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional
from xml.etree import ElementTree as ET

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class CardDAVError(Exception):
    """Базовое исключение для ошибок CardDAV клиента."""
    pass


class CardDAVConnectionError(CardDAVError):
    """Ошибка подключения к CardDAV серверу."""
    pass


class CardDAVAuthError(CardDAVError):
    """Ошибка аутентификации."""
    pass


class CardDAVNotFoundError(CardDAVError):
    """Ресурс не найден."""
    pass


class AddressBook:
    """Представление адресной книги CardDAV."""
    
    def __init__(self, href: str, display_name: Optional[str] = None):
        self.href = href
        self.display_name = display_name or href.split('/')[-1]
    
    def __repr__(self) -> str:
        return f"AddressBook(href={self.href!r}, display_name={self.display_name!r})"


class CardDAVClient:
    """Клиент для работы с CardDAV сервером.
    
    Поддерживает работу с реальным iCloud CardDAV и mock сервером.
    Mock сервер указывается через переменную окружения CARDDAV_MOCK_URL.
    """
    
    # Стандартные пути для iCloud CardDAV
    # Для реального iCloud может потребоваться использовать pXX-contacts.icloud.com вместо contacts.icloud.com
    # Но сначала пробуем стандартный URL
    ICLOUD_BASE_URL = "https://contacts.icloud.com"
    ICLOUD_WELL_KNOWN_PATH = "/.well-known/carddav"
    # Альтернативные базовые URL для реального iCloud (пробуем если стандартный не работает)
    ICLOUD_ALTERNATIVE_BASE_URLS = [
        "https://p02-contacts.icloud.com",
        "https://p01-contacts.icloud.com",
        "https://p03-contacts.icloud.com",
    ]
    
    def __init__(
        self,
        username: str,
        password: str,
        base_url: Optional[str] = None,
    ):
        """Инициализация CardDAV клиента.
        
        Args:
            username: Имя пользователя (Apple ID для iCloud)
            password: Пароль (app-specific password для iCloud)
            base_url: Базовый URL CardDAV сервера. Если не указан, используется
                     CARDDAV_MOCK_URL из env или стандартный iCloud URL.
        """
        self.username = username
        self.password = password
        
        # Определяем базовый URL с учетом настроек
        # Приоритет: base_url > env CARDDAV_MOCK_URL > настройки из config > iCloud по умолчанию
        if base_url:
            self.base_url = base_url.rstrip('/')
        else:
            # Проверяем переменную окружения (для обратной совместимости)
            mock_url_env = os.getenv("CARDDAV_MOCK_URL")
            if mock_url_env:
                self.base_url = mock_url_env.rstrip('/')
                logger.info(f"Using mock CardDAV server from CARDDAV_MOCK_URL: {self.base_url}")
            elif settings.icloud_mode == "mock":
                self.base_url = settings.mock_icloud_url.rstrip('/')
                logger.info(f"Using mock CardDAV server from config: {self.base_url}")
            else:
                self.base_url = self.ICLOUD_BASE_URL
                logger.info(f"Using real iCloud CardDAV server: {self.base_url}")
        
        # Создаем HTTP клиент с базовой аутентификацией
        self.client = httpx.Client(
            auth=(username, password),
            timeout=30.0,
            follow_redirects=True,
        )
    
    def discover(self) -> str:
        """Обнаруживает CardDAV endpoint через well-known путь используя current-user-principal и addressbook-home-set.
        
        Returns:
            URL CardDAV endpoint (например, /123456789/carddavhome/)
            
        Raises:
            CardDAVConnectionError: Ошибка подключения
            CardDAVAuthError: Ошибка аутентификации
            CardDAVError: Другая ошибка CardDAV
        """
        # Для реального iCloud используем правильный метод discovery с current-user-principal
        # Пробуем сначала стандартный URL, затем альтернативные
        base_urls_to_try = [self.base_url]
        if self.base_url == self.ICLOUD_BASE_URL:
            # Если используем стандартный iCloud URL, пробуем альтернативные
            base_urls_to_try.extend([f"https://p{i:02d}-contacts.icloud.com" for i in range(1, 10)])
        
        discovery_urls = []
        for base_url_to_try in base_urls_to_try:
            discovery_urls.extend([
                f"{base_url_to_try}/.well-known/carddav",
                f"{base_url_to_try}/co",
                f"{base_url_to_try}/",
            ])
        
        principal_url = None
        home_url = None
        
        for discovery_url in discovery_urls:
            logger.warning(f"Trying discovery URL: {discovery_url}")
            try:
                response = self.client.request(
                    "PROPFIND",
                    discovery_url,
                    headers={
                        "Depth": "0",
                        "Content-Type": "application/xml",
                    },
                    content=self._build_discovery_propfind_request(),
                )
                
                if response.status_code == 401:
                    raise CardDAVAuthError("Authentication failed")
                if response.status_code == 404:
                    logger.warning(f"404 for {discovery_url}, trying next")
                    continue
                if not response.is_success:
                    logger.warning(f"Failed discovery for {discovery_url}: {response.status_code}")
                    continue
                
                # Парсим ответ и ищем current-user-principal и addressbook-home-set
                root = ET.fromstring(response.text)
                logger.warning(f"Discovery response from {discovery_url} (first 5000 chars): {response.text[:5000]}")
                
                for response_elem in root.findall(".//{DAV:}response"):
                    # Ищем current-user-principal
                    if not principal_url:
                        principal_href = response_elem.findtext(".//{DAV:}current-user-principal/{DAV:}href")
                        if principal_href:
                            principal_url = principal_href if principal_href.startswith('http') else f"{self.base_url}{principal_href}"
                            logger.warning(f"Found principal URL: {principal_url}")
                    
                    # Ищем principal-URL как fallback
                    if not principal_url:
                        principal_href = response_elem.findtext(".//{DAV:}principal-URL/{DAV:}href")
                        if principal_href:
                            principal_url = principal_href if principal_href.startswith('http') else f"{self.base_url}{principal_href}"
                            logger.warning(f"Found principal URL (fallback): {principal_url}")
                    
                    # Ищем addressbook-home-set
                    if not home_url:
                        home_href = response_elem.findtext(".//{urn:ietf:params:xml:ns:carddav}addressbook-home-set/{DAV:}href")
                        if home_href:
                            if home_href.startswith('http'):
                                home_url = home_href
                            else:
                                # Используем базовый URL из discovery_url, а не self.base_url
                                base_from_discovery = discovery_url.split('/.well-known')[0].split('/co')[0].rstrip('/')
                                if not base_from_discovery:
                                    base_from_discovery = discovery_url.split('/')[0] + '//' + discovery_url.split('/')[2].split('/')[0]
                                home_url = f"{base_from_discovery}{home_href}"
                            logger.warning(f"Found home URL: {home_url}")
                    
                    if principal_url or home_url:
                        break
                
                if principal_url or home_url:
                    # Обновляем базовый URL если использовали альтернативный
                    for base_url_to_try in base_urls_to_try:
                        if discovery_url.startswith(base_url_to_try) and base_url_to_try != self.base_url:
                            logger.warning(f"Switching base URL from {self.base_url} to {base_url_to_try}")
                            self.base_url = base_url_to_try
                    break
                    
            except httpx.RequestError as e:
                logger.warning(f"Connection error for {discovery_url}: {e}")
                continue
            except ET.ParseError as e:
                logger.warning(f"Parse error for {discovery_url}: {e}")
                continue
        
        # Если нашли principal но не home, запрашиваем home у principal
        if home_url is None and principal_url is not None:
            logger.warning(f"Requesting addressbook-home-set from principal: {principal_url}")
            try:
                response = self.client.request(
                    "PROPFIND",
                    principal_url,
                    headers={
                        "Depth": "0",
                        "Content-Type": "application/xml",
                    },
                    content=self._build_discovery_propfind_request(),
                )
                if response.is_success:
                    root = ET.fromstring(response.text)
                    for response_elem in root.findall(".//{DAV:}response"):
                        home_href = response_elem.findtext(".//{urn:ietf:params:xml:ns:carddav}addressbook-home-set/{DAV:}href")
                        if home_href:
                            home_url = home_href if home_href.startswith('http') else f"{self.base_url}{home_href}"
                            logger.warning(f"Found home URL from principal: {home_url}")
                            break
            except Exception as e:
                logger.warning(f"Failed to get home-set from principal: {e}")
        
        if home_url is None:
            if os.getenv("CARDDAV_MOCK_URL"):
                return "/carddavhome/"
            raise CardDAVNotFoundError("Failed to discover addressbook-home-set")
        
        # Обрабатываем home_url: убираем порт :443 если есть, обновляем базовый URL
        # home_url может быть вида https://p30-contacts.icloud.com:443/1285405644/carddavhome/
        if home_url.startswith('http'):
            # Убираем порт :443 если есть
            home_url = home_url.replace(':443/', '/').replace(':443', '')
            # Извлекаем базовый URL и путь
            from urllib.parse import urlparse
            parsed = urlparse(home_url)
            new_base_url = f"{parsed.scheme}://{parsed.netloc}"
            home_path = parsed.path
            # Обновляем базовый URL
            if new_base_url != self.base_url:
                logger.warning(f"Updating base URL from {self.base_url} to {new_base_url}")
                self.base_url = new_base_url
            return home_path
        else:
            # Если это относительный путь, возвращаем как есть
            return home_url
    
    def list_addressbooks(self, carddav_path: Optional[str] = None) -> List[AddressBook]:
        """Получает список адресных книг.
        
        Args:
            carddav_path: Путь к CardDAV endpoint. Если не указан, выполняется discovery.
            
        Returns:
            Список адресных книг
            
        Raises:
            CardDAVConnectionError: Ошибка подключения
            CardDAVAuthError: Ошибка аутентификации
            CardDAVError: Другая ошибка CardDAV
        """
        if carddav_path is None:
            carddav_path = self.discover()
        
        # Для реального iCloud discovery может вернуть путь к well-known, 
        # но адресные книги находятся на другом пути (обычно /123456789/contacts/)
        # Попробуем использовать discovery путь напрямую, а если не найдем - попробуем альтернативные пути
        url = f"{self.base_url}{carddav_path}"
        logger.info(f"Listing addressbooks from URL: {url}, carddav_path: {repr(carddav_path)}")
        
        try:
            # Для реального iCloud: делаем запрос с Depth=1 к discovery пути
            # Если это well-known путь, он может быть коллекцией, содержащей адресные книги
            response = self.client.request(
                "PROPFIND",
                url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml",
                },
                content=self._build_propfind_request(),
            )
            
            if response.status_code == 401:
                raise CardDAVAuthError("Authentication failed")
            if response.status_code == 404:
                raise CardDAVNotFoundError(f"Addressbook path not found: {carddav_path}")
            if not response.is_success:
                raise CardDAVConnectionError(
                    f"Failed to list addressbooks: {response.status_code}"
                )
            
            # Парсим ответ
            root = ET.fromstring(response.text)
            logger.warning(f"Parsing addressbooks response from {url}, status: {response.status_code}")
            logger.warning(f"Response text (first 3000 chars): {response.text[:3000]}")
            addressbooks = self._parse_addressbooks_response(root)
            logger.warning(f"Found {len(addressbooks)} addressbooks: {[ab.href for ab in addressbooks]}")
            logger.warning(f"Checking fallback: carddav_path={repr(carddav_path)}, addressbooks empty={not addressbooks}, ends with well-known={carddav_path.endswith('/.well-known/carddav/') if carddav_path else False}")
            
            # Если не нашли адресные книги, пробуем альтернативные подходы
            if not addressbooks:
                logger.warning(f"No addressbooks found. carddav_path={repr(carddav_path)}")
                is_well_known = carddav_path and (carddav_path.endswith('/.well-known/carddav/') or carddav_path == '/.well-known/carddav' or carddav_path.endswith('.well-known/carddav'))
                logger.warning(f"is_well_known check: carddav_path={repr(carddav_path)}, is_well_known={is_well_known}")
                
                if is_well_known:
                    # Для реального iCloud: пробуем использовать альтернативные базовые URL
                    # iCloud может использовать разные серверы (p01-p09-contacts.icloud.com)
                    logger.warning(f"No addressbooks found at well-known path '{carddav_path}', trying alternative base URLs")
                    
                    # Пробуем альтернативные базовые URL
                    alternative_base_urls = [f"https://p{i:02d}-contacts.icloud.com" for i in range(1, 10)]
                    
                    for alt_base_url in alternative_base_urls:
                        try:
                            logger.warning(f"Trying alternative base URL: {alt_base_url}")
                            # Пробуем discovery с альтернативным базовым URL
                            alt_well_known_url = f"{alt_base_url}{self.ICLOUD_WELL_KNOWN_PATH}"
                            alt_response = self.client.request(
                                "PROPFIND",
                                alt_well_known_url,
                                headers={
                                    "Depth": "0",
                                    "Content-Type": "application/xml",
                                },
                                content=self._build_propfind_request(),
                            )
                            
                            if alt_response.status_code == 401:
                                raise CardDAVAuthError("Authentication failed")
                            if alt_response.status_code == 404:
                                logger.warning(f"404 for {alt_base_url}, trying next")
                                continue
                            if not alt_response.is_success:
                                logger.warning(f"Failed discovery for {alt_base_url}: {alt_response.status_code}")
                                continue
                            
                            # Парсим ответ
                            alt_root = ET.fromstring(alt_response.text)
                            logger.warning(f"Alternative base URL {alt_base_url} discovery response (first 5000 chars): {alt_response.text[:5000]}")
                            
                            # Ищем путь пользователя в ответе
                            for response_elem in alt_root.findall(".//{DAV:}response"):
                                href_elem = response_elem.find("{DAV:}href")
                                if href_elem is not None and href_elem.text:
                                    alt_href = href_elem.text
                                    # Убираем базовый URL если есть
                                    if alt_href.startswith(alt_base_url):
                                        alt_href = alt_href[len(alt_base_url):]
                                    # Если это выглядит как путь пользователя
                                    if 'carddavhome' in alt_href.lower() or (alt_href.count('/') >= 2 and any(c.isdigit() for c in alt_href.split('/')[1] if len(alt_href.split('/')) > 1)):
                                        if not alt_href.endswith('.well-known/carddav') and alt_href != '/.well-known/carddav/' and alt_href != '/':
                                            logger.warning(f"Found user path with alternative base URL {alt_base_url}: {alt_href}")
                                            # Пробуем использовать найденный путь пользователя
                                            user_path_url = f"{alt_base_url}{alt_href}"
                                            user_response = self.client.request(
                                                "PROPFIND",
                                                user_path_url,
                                                headers={
                                                    "Depth": "1",
                                                    "Content-Type": "application/xml",
                                                },
                                                content=self._build_propfind_request(),
                                            )
                                            if user_response.is_success:
                                                logger.warning(f"User path response status: {user_response.status_code}")
                                                logger.warning(f"User path response (first 3000 chars): {user_response.text[:3000]}")
                                                root_user = ET.fromstring(user_response.text)
                                                addressbooks = self._parse_addressbooks_response(root_user)
                                                logger.warning(f"Found {len(addressbooks)} addressbooks at user path {alt_href} with base URL {alt_base_url}: {[ab.href for ab in addressbooks]}")
                                                if addressbooks:
                                                    # Обновляем базовый URL
                                                    self.base_url = alt_base_url
                                                    return addressbooks
                            
                            # Если не нашли путь пользователя, пробуем стандартные пути с альтернативным базовым URL
                            user_paths_to_try = ["/carddavhome/", "/carddavhome"]
                            for user_path in user_paths_to_try:
                                try:
                                    user_path_url = f"{alt_base_url}{user_path}"
                                    logger.warning(f"Trying user path with alternative base URL: {user_path_url}")
                                    user_response = self.client.request(
                                        "PROPFIND",
                                        user_path_url,
                                        headers={
                                            "Depth": "1",
                                            "Content-Type": "application/xml",
                                        },
                                        content=self._build_propfind_request(),
                                    )
                                    if user_response.is_success:
                                        logger.warning(f"User path response status: {user_response.status_code}")
                                        root_user = ET.fromstring(user_response.text)
                                        addressbooks = self._parse_addressbooks_response(root_user)
                                        logger.warning(f"Found {len(addressbooks)} addressbooks at user path {user_path} with base URL {alt_base_url}: {[ab.href for ab in addressbooks]}")
                                        if addressbooks:
                                            # Обновляем базовый URL
                                            self.base_url = alt_base_url
                                            return addressbooks
                                except Exception as e:
                                    logger.warning(f"User path {user_path} with {alt_base_url} failed: {e}")
                                    continue
                                    
                        except Exception as e:
                            logger.warning(f"Alternative base URL {alt_base_url} failed: {e}")
                            continue
            
            if not addressbooks:
                logger.warning(f"No addressbooks found in response. Response status: {response.status_code}, URL: {url}")
                logger.warning(f"Full response text: {response.text}")
            return addressbooks
            
        except httpx.RequestError as e:
            raise CardDAVConnectionError(f"Connection error: {e}") from e
        except ET.ParseError as e:
            raise CardDAVError(f"Failed to parse addressbooks response: {e}") from e
    
    def list_contacts(self, addressbook_path: Optional[str] = None, limit: Optional[int] = None) -> List[tuple[str, str, str]]:
        """Получает список контактов из адресной книги.
        
        Args:
            addressbook_path: Путь к адресной книге. Если не указан, используется discovery.
            limit: Максимальное количество контактов для получения. Если None, получаются все.
            
        Returns:
            Список кортежей (contact_uri, etag, vcard_content)
            
        Raises:
            CardDAVConnectionError: Ошибка подключения
            CardDAVAuthError: Ошибка аутентификации
            CardDAVError: Другая ошибка CardDAV
        """
        if addressbook_path is None:
            addressbooks = self.list_addressbooks()
            if not addressbooks:
                raise CardDAVError("No addressbooks found")
            addressbook_path = addressbooks[0].href
        
        url = f"{self.base_url}{addressbook_path}"
        logger.warning(f"Listing contacts from addressbook: {url}")
        
        try:
            # Используем REPORT запрос с addressbook-query для получения списка контактов
            response = self.client.request(
                "REPORT",
                url,
                headers={
                    "Depth": "1",
                    "Content-Type": "application/xml",
                },
                content=self._build_addressbook_query_request(),
            )
            
            if response.status_code == 401:
                raise CardDAVAuthError("Authentication failed")
            if response.status_code == 404:
                raise CardDAVNotFoundError(f"Addressbook not found: {addressbook_path}")
            if not response.is_success:
                raise CardDAVConnectionError(
                    f"Failed to list contacts: {response.status_code}"
                )
            
            # Парсим ответ
            root = ET.fromstring(response.text)
            logger.warning(f"Contacts response status: {response.status_code}, response length: {len(response.text)}")
            
            contacts = []
            for response_elem in root.findall(".//{DAV:}response"):
                href_elem = response_elem.find("{DAV:}href")
                if href_elem is None or not href_elem.text:
                    continue
                
                href = href_elem.text
                # Пропускаем сам адресную книгу
                if href.rstrip('/') == url.rstrip('/'):
                    continue
                
                # Извлекаем URI контакта (относительный путь)
                if href.startswith(self.base_url):
                    contact_uri = href[len(self.base_url):]
                else:
                    contact_uri = href
                
                # Убираем путь адресной книги из URI
                if contact_uri.startswith(addressbook_path):
                    contact_uri = contact_uri[len(addressbook_path):].lstrip('/')
                
                # Получаем ETag
                etag_elem = response_elem.find(".//{DAV:}getetag")
                etag = etag_elem.text.strip('"') if etag_elem is not None and etag_elem.text else ""
                
                # Получаем vCard данные
                address_data_elem = response_elem.find(".//{urn:ietf:params:xml:ns:carddav}address-data")
                vcard_content = address_data_elem.text if address_data_elem is not None and address_data_elem.text else ""
                
                if vcard_content:
                    contacts.append((contact_uri, etag, vcard_content))
                    if limit and len(contacts) >= limit:
                        break
            
            logger.warning(f"Found {len(contacts)} contacts in addressbook")
            return contacts
            
        except httpx.RequestError as e:
            raise CardDAVConnectionError(f"Connection error: {e}") from e
        except ET.ParseError as e:
            raise CardDAVError(f"Failed to parse contacts response: {e}") from e
    
    def fetch_contact(self, contact_uri: str, addressbook_path: Optional[str] = None) -> tuple[str, str]:
        """Получает контакт (vCard) по URI.
        
        Args:
            contact_uri: URI контакта (например, /123456789/carddavhome/card.vcf)
            addressbook_path: Путь к адресной книге. Если не указан, используется discovery.
            
        Returns:
            Кортеж (etag, vcard_content)
            
        Raises:
            CardDAVNotFoundError: Контакт не найден
            CardDAVConnectionError: Ошибка подключения
            CardDAVAuthError: Ошибка аутентификации
        """
        # Если URI относительный, добавляем базовый URL и путь к адресной книге
        if not contact_uri.startswith('http'):
            if addressbook_path is None:
                addressbook_path = self.discover()
            # Убираем начальный слэш если есть
            contact_uri = contact_uri.lstrip('/')
            url = f"{self.base_url}{addressbook_path}{contact_uri}"
        else:
            url = contact_uri
        
        try:
            response = self.client.get(url)
            
            if response.status_code == 401:
                raise CardDAVAuthError("Authentication failed")
            if response.status_code == 404:
                raise CardDAVNotFoundError(f"Contact not found: {contact_uri}")
            if not response.is_success:
                raise CardDAVConnectionError(
                    f"Failed to fetch contact: {response.status_code}"
                )
            
            # Получаем ETag из заголовков
            etag = response.headers.get("ETag", "").strip('"')
            vcard_content = response.text
            
            return etag, vcard_content
            
        except httpx.RequestError as e:
            raise CardDAVConnectionError(f"Connection error: {e}") from e
    
    def create_contact(
        self,
        vcard_content: str,
        contact_filename: str,
        addressbook_path: Optional[str] = None,
    ) -> tuple[str, str]:
        """Создает новый контакт (vCard).
        
        Args:
            vcard_content: Содержимое vCard в формате vCard 3.0/4.0
            contact_filename: Имя файла контакта (например, "new-contact.vcf")
            addressbook_path: Путь к адресной книге. Если не указан, используется discovery.
            
        Returns:
            Кортеж (contact_uri, etag)
            
        Raises:
            CardDAVConnectionError: Ошибка подключения
            CardDAVAuthError: Ошибка аутентификации
            CardDAVError: Другая ошибка CardDAV
        """
        if addressbook_path is None:
            addressbook_path = self.discover()
        
        # Убираем начальный слэш если есть
        contact_filename = contact_filename.lstrip('/')
        # Убеждаемся, что addressbook_path заканчивается на /
        if not addressbook_path.endswith('/'):
            addressbook_path = addressbook_path + '/'
        url = f"{self.base_url}{addressbook_path}{contact_filename}"
        
        logger.warning(f"Creating contact: URL={url}, filename={contact_filename}, vcard_length={len(vcard_content)}")
        logger.warning(f"vCard content preview: {vcard_content[:200]}...")
        
        try:
            response = self.client.put(
                url,
                content=vcard_content,
                headers={
                    "Content-Type": "text/vcard; charset=utf-8",
                },
            )
            
            logger.warning(f"Create contact response: status={response.status_code}, headers={dict(response.headers)}")
            if not response.is_success:
                logger.warning(f"Create contact error response body: {response.text[:500]}")
            
            if response.status_code == 401:
                raise CardDAVAuthError("Authentication failed")
            if response.status_code == 403:
                raise CardDAVError("Permission denied")
            if response.status_code == 409:
                raise CardDAVError("Contact already exists")
            if not response.is_success:
                raise CardDAVConnectionError(
                    f"Failed to create contact: {response.status_code}. Response: {response.text[:200]}"
                )
            
            # Получаем ETag из заголовков ответа
            etag = response.headers.get("ETag", "").strip('"')
            # URI контакта - это URL без базового пути
            contact_uri = contact_filename
            
            logger.warning(f"Successfully created contact: uri={contact_uri}, etag={etag}")
            return contact_uri, etag
            
        except httpx.RequestError as e:
            raise CardDAVConnectionError(f"Connection error: {e}") from e
    
    def close(self) -> None:
        """Закрывает HTTP клиент."""
        self.client.close()
    
    def __enter__(self):
        """Поддержка контекстного менеджера."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Поддержка контекстного менеджера."""
        self.close()
    
    def _build_propfind_request(self) -> str:
        """Строит XML запрос PROPFIND."""
        return """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <card:addressbook-description/>
  </d:prop>
</d:propfind>"""
    
    def _build_discovery_propfind_request(self) -> str:
        """Строит XML запрос PROPFIND для discovery с current-user-principal и addressbook-home-set."""
        return """<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:current-user-principal/>
    <d:principal-URL/>
    <card:addressbook-home-set/>
  </d:prop>
</d:propfind>"""
    
    def _build_addressbook_query_request(self) -> str:
        """Строит XML запрос REPORT для получения списка контактов из адресной книги."""
        return """<?xml version="1.0" encoding="UTF-8"?>
<c:addressbook-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <c:address-data/>
  </d:prop>
</c:addressbook-query>"""
    
    def _parse_discovery_response(self, root: ET.Element) -> str:
        """Парсит ответ discovery и возвращает href адресной книги или коллекции для дальнейшего запроса."""
        logger.debug(f"Parsing discovery response. Root tag: {root.tag}")
        
        # Ищем href с addressbook в resourcetype
        for response in root.findall(".//{DAV:}response"):
            href_elem = response.find("{DAV:}href")
            if href_elem is None or not href_elem.text:
                continue
            
            href = href_elem.text
            logger.debug(f"Discovery response href: {href}")
            
            # Проверяем, что это адресная книга
            resourcetype = response.find(".//{DAV:}resourcetype")
            if resourcetype is not None:
                # Ищем card:addressbook в resourcetype
                addressbook_elem = resourcetype.find("{urn:ietf:params:xml:ns:carddav}addressbook")
                if addressbook_elem is not None:
                    # Убираем базовый URL если есть
                    if href.startswith(self.base_url):
                        href = href[len(self.base_url):]
                    logger.info(f"Found addressbook in discovery: {href}")
                    return href
            
            # Если не нашли addressbook, но это коллекция и не well-known, используем её
            # Для реального iCloud discovery может вернуть путь к коллекции, где находятся адресные книги
            if not href.endswith('.well-known/carddav') and href.endswith('/'):
                # Убираем базовый URL если есть
                if href.startswith(self.base_url):
                    href = href[len(self.base_url):]
                # Пропускаем well-known путь, но используем другие коллекции
                if not href.endswith('.well-known/carddav'):
                    logger.info(f"Using collection from discovery (not addressbook): {href}")
                    return href
        
        # Если ничего не нашли, возвращаем well-known путь (для реального iCloud это нормально)
        # В этом случае list_addressbooks должен найти адресные книги внутри с Depth=infinity
        logger.info("No specific addressbook found in discovery, using well-known path")
        return "/.well-known/carddav/"
    
    def _parse_addressbooks_response(self, root: ET.Element) -> List[AddressBook]:
        """Парсит ответ списка адресных книг."""
        addressbooks = []
        logger.debug(f"Parsing addressbooks response. Root tag: {root.tag}, Root attrib: {root.attrib}")
        
        responses = root.findall(".//{DAV:}response")
        logger.debug(f"Found {len(responses)} response elements")
        
        for idx, response in enumerate(responses):
            href_elem = response.find("{DAV:}href")
            if href_elem is None or not href_elem.text:
                continue
            
            href = href_elem.text
            # Убираем базовый URL если есть
            if href.startswith(self.base_url):
                href = href[len(self.base_url):]
            
            # Проверяем, что это адресная книга (должен быть card:addressbook в resourcetype)
            resourcetype = response.find(".//{DAV:}resourcetype")
            if resourcetype is not None:
                addressbook_elem = resourcetype.find("{urn:ietf:params:xml:ns:carddav}addressbook")
                if addressbook_elem is None:
                    # Пропускаем элементы, которые не являются адресными книгами
                    logger.debug(f"Response {idx}: href={href}, not an addressbook (no card:addressbook in resourcetype)")
                    continue
                logger.debug(f"Response {idx}: href={href}, is an addressbook")
            
            # Для реального iCloud: пропускаем только well-known путь, но включаем все остальные коллекции
            # которые могут быть адресными книгами
            if href.endswith('/.well-known/carddav/') or href == '/.well-known/carddav' or href == '/.well-known/carddav':
                logger.debug(f"Response {idx}: href={href}, skipping well-known path")
                continue
            
            # Для реального iCloud: если это коллекция без card:addressbook, но не well-known,
            # это может быть путь к адресной книге пользователя (например, /123456789/contacts/)
            # Проверяем, есть ли card:addressbook в resourcetype
            if resourcetype is None:
                logger.debug(f"Response {idx}: href={href}, no resourcetype, skipping")
                continue
            
            displayname_elem = response.find(".//{DAV:}displayname")
            display_name = None
            if displayname_elem is not None and displayname_elem.text:
                display_name = displayname_elem.text
            
            addressbooks.append(AddressBook(href=href, display_name=display_name))
        
        return addressbooks
