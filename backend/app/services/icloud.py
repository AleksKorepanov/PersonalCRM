"""Сервис для работы с iCloud интеграцией."""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.core.deps import WorkspaceContext
from app.core.security import UserPrincipal
from app.integrations.icloud.carddav_client import CardDAVClient, CardDAVError
from app.schemas.icloud import ICloudAccount, ICloudConnectRequest
from app.services.db import execute, execute_returning_one, fetchall, fetchone
from app.utils.vcard_parser import parse_vcard
from app.utils.vcard_generator import generate_vcard
from app.utils.phone_normalize import normalize_phone
from app.utils.pagination import decode_cursor, encode_cursor
from app.services import contacts as contacts_svc

logger = logging.getLogger(__name__)


def _encrypt_password(password: str) -> str:
    """Шифрует пароль для хранения в БД.
    
    ВНИМАНИЕ: Для production нужно использовать реальное шифрование (AES-256-GCM).
    Здесь используется base64 для простоты в dev/mock режиме.
    """
    # TODO: Реализовать реальное шифрование AES-256-GCM
    return base64.b64encode(password.encode('utf-8')).decode('utf-8')


def _decrypt_password(encrypted: str) -> str:
    """Расшифровывает пароль из БД."""
    # TODO: Реализовать реальное расшифрование AES-256-GCM
    return base64.b64decode(encrypted.encode('utf-8')).decode('utf-8')


def connect_icloud(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    payload: ICloudConnectRequest,
) -> Dict:
    """Подключает iCloud аккаунт.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        user: Пользователь
        payload: Данные подключения
        
    Returns:
        Словарь с данными подключенного аккаунта
        
    Raises:
        HTTPException: Если аккаунт уже подключен или ошибка подключения
    """
    # Проверяем, что аккаунт еще не подключен
    existing = fetchone(
        conn,
        """
        SELECT id FROM icloud_accounts
        WHERE workspace_id = %s AND user_id = %s
        """,
        (ctx.workspace_id, user.user_id),
    )
    
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "ALREADY_CONNECTED", "message": "Аккаунт уже подключен для этого workspace"},
        )
    
    # Проверяем подключение через CardDAV
    try:
        with CardDAVClient(username=payload.apple_id, password=payload.app_password) as client:
            # Пробуем выполнить discovery для проверки учетных данных
            client.discover()
    except CardDAVError as e:
        logger.error(f"CardDAV connection error: {e}")
        raise HTTPException(
            status_code=400,
            detail={"code": "CONNECTION_FAILED", "message": f"Не удалось подключиться к iCloud: {str(e)}"},
        )
    
    # Шифруем пароль
    encrypted_password = _encrypt_password(payload.app_password)
    
    # Сохраняем аккаунт
    account = execute_returning_one(
        conn,
        """
        INSERT INTO icloud_accounts (workspace_id, user_id, apple_id, app_password_encrypted)
        VALUES (%s, %s, %s, %s)
        RETURNING id, workspace_id, apple_id, sync_enabled, last_sync_at, sync_error, created_at, updated_at
        """,
        (ctx.workspace_id, user.user_id, payload.apple_id, encrypted_password),
    )
    
    return {
        "id": account["id"],
        "workspace_id": account["workspace_id"],
        "apple_id": account["apple_id"],  # В реальности нужно маскировать
        "sync_enabled": account["sync_enabled"],
        "last_sync_at": account["last_sync_at"],
        "sync_error": account["sync_error"],
        "created_at": account["created_at"],
        "updated_at": account["updated_at"],
    }


def disconnect_icloud(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
) -> None:
    """Отключает iCloud аккаунт."""
    account = fetchone(
        conn,
        """
        SELECT id FROM icloud_accounts
        WHERE workspace_id = %s AND user_id = %s
        """,
        (ctx.workspace_id, user.user_id),
    )
    
    if not account:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud аккаунт не подключен"},
        )
    
    # Удаляем аккаунт (каскадно удалятся контакты и связи)
    execute(
        conn,
        """
        DELETE FROM icloud_accounts
        WHERE id = %s
        """,
        (account["id"],),
    )
    conn.commit()


def get_icloud_status(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
) -> Dict:
    """Получает статус подключения iCloud аккаунта."""
    account = fetchone(
        conn,
        """
        SELECT id, workspace_id, apple_id, sync_enabled, last_sync_at, sync_error, created_at, updated_at
        FROM icloud_accounts
        WHERE workspace_id = %s AND user_id = %s
        """,
        (ctx.workspace_id, user.user_id),
    )
    
    if not account:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud аккаунт не подключен"},
        )
    
    return {
        "id": account["id"],
        "workspace_id": account["workspace_id"],
        "apple_id": account["apple_id"],  # В реальности нужно маскировать
        "sync_enabled": account["sync_enabled"],
        "last_sync_at": account["last_sync_at"],
        "sync_error": account["sync_error"],
        "created_at": account["created_at"],
        "updated_at": account["updated_at"],
    }


def sync_icloud_contacts(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    full_sync: bool = False,
) -> Dict:
    """Синхронизирует контакты из iCloud.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        user: Пользователь
        full_sync: Если True, выполняет полную синхронизацию (игнорирует ETag)
        
    Returns:
        Словарь с результатами синхронизации:
        - status: "completed" или "error"
        - synced_count: Количество синхронизированных контактов
        
    Raises:
        HTTPException: Если аккаунт не подключен или ошибка синхронизации
    """
    # Получаем аккаунт
    account = fetchone(
        conn,
        """
        SELECT id, apple_id, app_password_encrypted, sync_etag
        FROM icloud_accounts
        WHERE workspace_id = %s AND user_id = %s
        """,
        (ctx.workspace_id, user.user_id),
    )
    
    if not account:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud аккаунт не подключен"},
        )
    
    # Расшифровываем пароль
    password = _decrypt_password(account["app_password_encrypted"])
    
    synced_count = 0
    error_message = None
    
    try:
        with CardDAVClient(username=account["apple_id"], password=password) as client:
            # Discovery
            carddav_path = client.discover()
            
            # Получаем список адресных книг
            addressbooks = client.list_addressbooks(carddav_path)
            if not addressbooks:
                logger.error(f"No addressbooks found after discovery. CardDAV path: {carddav_path}, Base URL: {client.base_url}")
                logger.error(f"Apple ID: {account['apple_id']}")
                # Для реального iCloud может потребоваться путь пользователя вида /123456789/carddavhome/
                # который не возвращается автоматически из discovery
                raise HTTPException(
                    status_code=500,
                    detail={
                        "code": "SYNC_ERROR", 
                        "message": "Не найдено адресных книг. Для реального iCloud CardDAV требуется путь пользователя вида /123456789/carddavhome/, который не может быть получен автоматически. Убедитесь, что:\n1. В вашем iCloud аккаунте есть контакты\n2. Используется правильный app-specific password\n3. Аккаунт iCloud активен и синхронизация включена"
                    },
                )
            
            addressbook_path = addressbooks[0].href
            
            # Получаем список контактов (PROPFIND для получения remote_uri и etag)
            # Для простоты используем список адресных книг, который уже содержит контакты
            # В реальности нужно сделать отдельный PROPFIND запрос для получения списка контактов
            
            # Получаем список всех контактов из БД для сравнения ETag
            existing_contacts = {}
            if not full_sync:
                existing = fetchall(
                    conn,
                    """
                    SELECT remote_uri, etag
                    FROM icloud_contacts
                    WHERE workspace_id = %s AND icloud_account_id = %s AND deleted_at IS NULL
                    """,
                    (ctx.workspace_id, account["id"]),
                )
                for contact in existing:
                    existing_contacts[contact["remote_uri"]] = contact["etag"]
            
            # Получаем список контактов из адресной книги
            logger.info(f"Getting contacts from addressbook: {addressbook_path}")
            try:
                contacts_list = client.list_contacts(addressbook_path)
            except Exception as e:
                logger.error(f"Failed to list contacts: {e}")
                # Fallback: пробуем использовать тестовые контакты для mock сервера
                if settings.icloud_mode == "mock":
                    logger.warning("Using test contacts for mock server")
                    contacts_list = []
                    test_contacts = ["sample-contact.vcf", "john-doe.vcf"]
                    for contact_filename in test_contacts:
                        try:
                            etag, vcard_content = client.fetch_contact(contact_filename, addressbook_path)
                            contacts_list.append((contact_filename, etag, vcard_content))
                        except Exception as fetch_error:
                            logger.warning(f"Failed to fetch test contact {contact_filename}: {fetch_error}")
                else:
                    raise HTTPException(
                        status_code=500,
                        detail={
                            "code": "SYNC_ERROR",
                            "message": f"Не удалось получить список контактов: {str(e)}"
                        },
                    )
            
            logger.info(f"Found {len(contacts_list)} contacts to sync")
            
            for contact_uri, etag, vcard_content in contacts_list:
                try:
                    remote_uri = contact_uri
                    
                    # Проверяем, изменился ли контакт
                    if not full_sync and remote_uri in existing_contacts:
                        if existing_contacts[remote_uri] == etag:
                            continue  # Контакт не изменился
                    
                    # Парсим vCard
                    try:
                        parsed = parse_vcard(vcard_content)
                    except Exception as parse_error:
                        logger.error(f"Failed to parse vCard for {remote_uri}: {parse_error}")
                        continue
                    
                    # Нормализуем телефоны и emails для поиска
                    phones_normalized = []
                    emails_normalized = []
                    
                    for phone in parsed.get("phones", []):
                        normalized = normalize_phone(phone["value"])
                        if normalized:
                            phones_normalized.append(normalized)
                    
                    for email in parsed.get("emails", []):
                        emails_normalized.append(email["value"].lower().strip())
                    
                    # Сохраняем или обновляем контакт (идемпотентность по remote_uri)
                    execute(
                        conn,
                        """
                        INSERT INTO icloud_contacts (
                            workspace_id, icloud_account_id, remote_uri, etag, vcard_raw,
                            display_name, given_name, middle_name, family_name,
                            company, department, job_title,
                            phones, emails, phones_normalized, emails_normalized,
                            last_synced_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (workspace_id, remote_uri)
                        DO UPDATE SET
                            etag = EXCLUDED.etag,
                            vcard_raw = EXCLUDED.vcard_raw,
                            display_name = EXCLUDED.display_name,
                            given_name = EXCLUDED.given_name,
                            middle_name = EXCLUDED.middle_name,
                            family_name = EXCLUDED.family_name,
                            company = EXCLUDED.company,
                            department = EXCLUDED.department,
                            job_title = EXCLUDED.job_title,
                            phones = EXCLUDED.phones,
                            emails = EXCLUDED.emails,
                            phones_normalized = EXCLUDED.phones_normalized,
                            emails_normalized = EXCLUDED.emails_normalized,
                            last_synced_at = NOW(),
                            updated_at = NOW(),
                            deleted_at = NULL
                        """,
                        (
                            ctx.workspace_id,
                            account["id"],
                            remote_uri,
                            etag,
                            vcard_content,
                            parsed.get("display_name"),
                            parsed.get("structured_name", {}).get("given_name"),
                            parsed.get("structured_name", {}).get("middle_name"),
                            parsed.get("structured_name", {}).get("family_name"),
                            parsed.get("company"),
                            parsed.get("department"),
                            parsed.get("job_title"),
                            json.dumps(parsed.get("phones", [])),
                            json.dumps(parsed.get("emails", [])),
                            phones_normalized,
                            emails_normalized,
                        ),
                    )
                    synced_count += 1
                    
                except Exception as e:
                    logger.warning(f"Error syncing contact {remote_uri}: {e}")
                    continue
            
            # После синхронизации пытаемся автоматически связать контакты по телефону
            # Получаем все не связанные iCloud контакты с нормализованными телефонами
            unlinked_contacts = fetchall(
                conn,
                """
                SELECT ic.id, ic.phones_normalized
                FROM icloud_contacts ic
                LEFT JOIN icloud_contact_links icl ON ic.id = icl.icloud_contact_id AND icl.link_status = 'active'
                WHERE ic.workspace_id = %s AND ic.icloud_account_id = %s
                  AND ic.deleted_at IS NULL AND icl.id IS NULL
                  AND ic.phones_normalized IS NOT NULL AND array_length(ic.phones_normalized, 1) > 0
                """,
                (ctx.workspace_id, account["id"]),
            )
            
            for unlinked in unlinked_contacts:
                phones_norm = unlinked["phones_normalized"]
                if phones_norm:
                    if not isinstance(phones_norm, list):
                        phones_norm = list(phones_norm) if phones_norm else []
                    if phones_norm:
                        try:
                            _try_auto_link_by_phone(conn, ctx, user, unlinked["id"], phones_norm)
                        except Exception as e:
                            logger.error(f"Error in auto-link for contact {unlinked['id']}: {e}")
            
            # Обновляем время последней синхронизации
            execute(
                conn,
                """
                UPDATE icloud_accounts
                SET last_sync_at = NOW(), sync_error = NULL, updated_at = NOW()
                WHERE id = %s
                """,
                (account["id"],),
            )
            conn.commit()
            
    except CardDAVError as e:
        error_message = str(e)
        logger.error(f"CardDAV sync error: {error_message}")
        
        # Сохраняем ошибку в аккаунт
        execute(
            conn,
            """
            UPDATE icloud_accounts
            SET sync_error = %s, updated_at = NOW()
            WHERE id = %s
            """,
            (error_message, account["id"]),
        )
        
        raise HTTPException(
            status_code=500,
            detail={"code": "SYNC_ERROR", "message": f"Ошибка синхронизации: {error_message}"},
        )
    
    return {
        "status": "completed",
        "synced_count": synced_count,
    }


def create_icloud_contact_from_crm(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    crm_contact: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Создает iCloud контакт из CRM контакта.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        user: Пользователь
        crm_contact: Словарь с данными CRM контакта (результат get_contact)
        
    Returns:
        Словарь с результатом создания:
        - success: bool
        - icloud_contact_id: UUID (если успешно)
        - link_id: UUID (если успешно создана связь)
        - error: str (если ошибка)
        - requires_sync: bool (если требуется синхронизация)
        
    Raises:
        HTTPException: Если критическая ошибка
    """
    # Проверяем, подключен ли iCloud аккаунт
    account = fetchone(
        conn,
        """
        SELECT id, apple_id, app_password_encrypted
        FROM icloud_accounts
        WHERE workspace_id = %s AND user_id = %s
        """,
        (ctx.workspace_id, user.user_id),
    )
    
    if not account:
        # iCloud не подключен - это нормально, просто возвращаем флаг
        return {
            "success": False,
            "requires_sync": True,
            "error": "iCloud аккаунт не подключен",
        }
    
    # Генерируем vCard из CRM контакта
    try:
        vcard_content = generate_vcard(crm_contact)
    except Exception as e:
        logger.error(f"Error generating vCard for contact {crm_contact.get('id')}: {e}")
        return {
            "success": False,
            "requires_sync": True,
            "error": f"Ошибка генерации vCard: {str(e)}",
        }
    
    # Расшифровываем пароль
    password = _decrypt_password(account["app_password_encrypted"])
    
    # Создаем контакт через CardDAV
    try:
        with CardDAVClient(username=account["apple_id"], password=password) as client:
            # Discovery
            carddav_path = client.discover()
            
            # Получаем список адресных книг
            addressbooks = client.list_addressbooks(carddav_path)
            if not addressbooks:
                return {
                    "success": False,
                    "requires_sync": True,
                    "error": "Не найдено адресных книг",
                }
            
            addressbook_path = addressbooks[0].href
            
            # Генерируем уникальное имя файла для контакта
            contact_filename = f"crm-{crm_contact['id']}-{uuid4().hex[:8]}.vcf"
            
            # Создаем контакт через CardDAV
            remote_uri, etag = client.create_contact(vcard_content, contact_filename, addressbook_path)
            
            # Нормализуем телефоны для связи
            phones_normalized = []
            phones = crm_contact.get("phones", [])
            if isinstance(phones, str):
                try:
                    phones = json.loads(phones) if phones else []
                except:
                    phones = [phones] if phones else []
            
            for phone in phones:
                if isinstance(phone, str):
                    normalized = normalize_phone(phone)
                    if normalized:
                        phones_normalized.append(normalized)
            
            # Парсим vCard для получения структурированных данных
            parsed = parse_vcard(vcard_content)
            
            logger.warning(f"Saving iCloud contact to DB: remote_uri={remote_uri}, etag={etag}, display_name={parsed.get('display_name')}")
            
            # Сохраняем iCloud контакт в БД
            icloud_contact_row = execute_returning_one(
                conn,
                """
                INSERT INTO icloud_contacts (
                    workspace_id, icloud_account_id, remote_uri, etag, vcard_raw,
                    display_name, given_name, middle_name, family_name,
                    company, department, job_title,
                    phones, emails, phones_normalized, emails_normalized,
                    last_synced_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (workspace_id, remote_uri)
                DO UPDATE SET
                    etag = EXCLUDED.etag,
                    vcard_raw = EXCLUDED.vcard_raw,
                    display_name = EXCLUDED.display_name,
                    given_name = EXCLUDED.given_name,
                    middle_name = EXCLUDED.middle_name,
                    family_name = EXCLUDED.family_name,
                    company = EXCLUDED.company,
                    department = EXCLUDED.department,
                    job_title = EXCLUDED.job_title,
                    phones = EXCLUDED.phones,
                    emails = EXCLUDED.emails,
                    phones_normalized = EXCLUDED.phones_normalized,
                    emails_normalized = EXCLUDED.emails_normalized,
                    last_synced_at = NOW(),
                    updated_at = NOW(),
                    deleted_at = NULL
                RETURNING id
                """,
                (
                    ctx.workspace_id,
                    account["id"],
                    remote_uri,
                    etag,
                    vcard_content,
                    parsed.get("display_name"),
                    parsed.get("structured_name", {}).get("given_name"),
                    parsed.get("structured_name", {}).get("middle_name"),
                    parsed.get("structured_name", {}).get("family_name"),
                    parsed.get("company"),
                    parsed.get("department"),
                    parsed.get("job_title"),
                    json.dumps(parsed.get("phones", [])),
                    json.dumps(parsed.get("emails", [])),
                    phones_normalized,
                    [],  # emails_normalized - можно добавить позже
                ),
            )
            
            icloud_contact_id = icloud_contact_row["id"]
            
            # Создаем связь между CRM и iCloud контактом
            link_id = None
            if phones_normalized:
                # Используем первый нормализованный телефон для связи
                phone_norm = phones_normalized[0]
                
                link_row = execute_returning_one(
                    conn,
                    """
                    INSERT INTO icloud_contact_links (
                        workspace_id, contact_id, icloud_contact_id,
                        link_type, phone_norm, link_status, confidence_score,
                        linked_at, linked_by
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s)
                    ON CONFLICT (contact_id, icloud_contact_id)
                    DO UPDATE SET
                        link_type = EXCLUDED.link_type,
                        phone_norm = EXCLUDED.phone_norm,
                        link_status = 'active',
                        confidence_score = EXCLUDED.confidence_score,
                        linked_at = NOW(),
                        linked_by = EXCLUDED.linked_by
                    RETURNING id
                    """,
                    (
                        ctx.workspace_id,
                        crm_contact["id"],
                        icloud_contact_id,
                        "auto_create",
                        phone_norm,
                        "active",
                        1.0,  # Высокая уверенность для автоматически созданных
                        user.user_id,
                    ),
                )
                link_id = link_row["id"]
            
            conn.commit()
            
            return {
                "success": True,
                "icloud_contact_id": str(icloud_contact_id),
                "link_id": str(link_id) if link_id else None,
                "remote_uri": remote_uri,
                "etag": etag,
            }
            
    except CardDAVError as e:
        error_message = str(e)
        logger.error(f"CardDAV error creating contact: {error_message}")
        # НЕ делаем rollback - вызывающий код сам управляет транзакцией
        # Просто возвращаем ошибку
        return {
            "success": False,
            "requires_sync": True,
            "error": f"Ошибка создания iCloud контакта: {error_message}",
        }
    except Exception as e:
        error_message = str(e)
        logger.error(f"Unexpected error creating iCloud contact: {error_message}")
        # НЕ делаем rollback - вызывающий код сам управляет транзакцией
        return {
            "success": False,
            "requires_sync": True,
            "error": f"Неожиданная ошибка: {error_message}",
        }


def _try_auto_link_by_phone(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    icloud_contact_id: UUID,
    phones_normalized: List[str],
) -> None:
    """Пытается автоматически связать iCloud контакт с CRM контактом по телефону.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        user: Пользователь
        icloud_contact_id: ID iCloud контакта
        phones_normalized: Список нормализованных телефонов iCloud контакта
    """
    # Проверяем, не связан ли уже контакт
    existing_link = fetchone(
        conn,
        """
        SELECT id FROM icloud_contact_links
        WHERE workspace_id = %s AND icloud_contact_id = %s AND link_status = 'active'
        """,
        (ctx.workspace_id, icloud_contact_id),
    )
    
    if existing_link:
        return  # Уже связан
    
    # Ищем CRM контакты с совпадающими телефонами
    matching_contacts = []
    
    # Получаем все CRM контакты в workspace
    crm_contacts = fetchall(
        conn,
        """
        SELECT id, phones
        FROM contacts
        WHERE workspace_id = %s AND deleted_at IS NULL
        """,
        (ctx.workspace_id,),
    )
    
    for contact in crm_contacts:
        try:
            contact_phones = contact.get("phones")
            if not contact_phones:
                continue
            
            phones_list = json.loads(contact_phones) if isinstance(contact_phones, str) else contact_phones
            if not isinstance(phones_list, list):
                continue
            
            # Нормализуем телефоны CRM контакта и сравниваем с телефонами iCloud контакта
            for phone in phones_list:
                if isinstance(phone, str):
                    crm_phone_norm = normalize_phone(phone)
                    if crm_phone_norm and crm_phone_norm in phones_normalized:
                        matching_contacts.append({
                            "contact_id": contact["id"],
                            "phone_norm": crm_phone_norm,
                        })
                        break  # Нашли совпадение для этого контакта, переходим к следующему
        except (json.JSONDecodeError, TypeError) as e:
            logger.debug(f"Error parsing phones for contact {contact.get('id')}: {e}")
            continue
    
    # Убираем дубликаты по contact_id
    unique_matches = {}
    for match in matching_contacts:
        contact_id = str(match["contact_id"])
        if contact_id not in unique_matches:
            unique_matches[contact_id] = match["phone_norm"]
    
    logger.debug(f"Found {len(unique_matches)} matching CRM contacts for iCloud contact {icloud_contact_id}: {unique_matches}")
    
    # Если найден ровно один контакт, создаём связь
    if len(unique_matches) == 1:
        crm_contact_id = list(unique_matches.keys())[0]
        phone_norm = unique_matches[crm_contact_id]
        
        logger.info(f"Auto-linking iCloud contact {icloud_contact_id} with CRM contact {crm_contact_id} by phone {phone_norm}")
        
        # Создаём связь
        execute(
            conn,
            """
            INSERT INTO icloud_contact_links (
                workspace_id, contact_id, icloud_contact_id,
                link_type, phone_norm, link_status, confidence_score,
                linked_at, linked_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            ON CONFLICT (contact_id, icloud_contact_id)
            DO UPDATE SET
                link_type = EXCLUDED.link_type,
                phone_norm = EXCLUDED.phone_norm,
                link_status = 'active',
                confidence_score = EXCLUDED.confidence_score,
                linked_at = NOW(),
                linked_by = EXCLUDED.linked_by
            """,
            (
                ctx.workspace_id,
                crm_contact_id,
                icloud_contact_id,
                "phone_match",
                phone_norm,
                "active",
                0.9,  # Высокая уверенность для совпадения по телефону
                user.user_id,
            ),
        )


def link_icloud_contact(
    conn,
    ctx: WorkspaceContext,
    user: UserPrincipal,
    icloud_contact_id: UUID,
    crm_contact_id: str,
    link_type: str,
) -> Dict:
    """Связывает iCloud контакт с CRM контактом вручную.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        user: Пользователь
        icloud_contact_id: ID iCloud контакта
        crm_contact_id: ID CRM контакта
        link_type: Тип связи ('phone_match', 'manual', 'auto_create')
        
    Returns:
        Словарь с данными связи
    """
    # Проверяем существование контактов
    icloud_contact = fetchone(
        conn,
        """
        SELECT id FROM icloud_contacts
        WHERE id = %s AND workspace_id = %s AND deleted_at IS NULL
        """,
        (icloud_contact_id, ctx.workspace_id),
    )
    
    if not icloud_contact:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud контакт не найден"},
        )
    
    crm_contact = fetchone(
        conn,
        """
        SELECT id FROM contacts
        WHERE id = %s AND workspace_id = %s AND deleted_at IS NULL
        """,
        (crm_contact_id, ctx.workspace_id),
    )
    
    if not crm_contact:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "CRM контакт не найден"},
        )
    
    # Если link_type = 'phone_match', проверяем совпадение по телефону
    phone_norm = None
    if link_type == 'phone_match':
        # Получаем телефоны обоих контактов
        icloud_contact_data = fetchone(
            conn,
            """
            SELECT phones_normalized FROM icloud_contacts
            WHERE id = %s
            """,
            (icloud_contact_id,),
        )
        
        crm_contact_data = fetchone(
            conn,
            """
            SELECT phones FROM contacts
            WHERE id = %s
            """,
            (crm_contact_id,),
        )
        
        if icloud_contact_data and crm_contact_data:
            icloud_phones_norm = icloud_contact_data.get("phones_normalized") or []
            crm_phones_raw = crm_contact_data.get("phones")
            
            if crm_phones_raw:
                try:
                    crm_phones = json.loads(crm_phones_raw) if isinstance(crm_phones_raw, str) else crm_phones_raw
                    if isinstance(crm_phones, list):
                        for phone in crm_phones:
                            if isinstance(phone, str):
                                norm = normalize_phone(phone)
                                if norm and norm in icloud_phones_norm:
                                    phone_norm = norm
                                    break
                except:
                    pass
    
    # Создаём или обновляем связь
    link = execute_returning_one(
        conn,
        """
        INSERT INTO icloud_contact_links (
            workspace_id, contact_id, icloud_contact_id,
            link_type, phone_norm, link_status, confidence_score,
            linked_at, linked_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s)
        ON CONFLICT (contact_id, icloud_contact_id)
        DO UPDATE SET
            link_type = EXCLUDED.link_type,
            phone_norm = EXCLUDED.phone_norm,
            link_status = 'active',
            confidence_score = EXCLUDED.confidence_score,
            linked_at = NOW(),
            linked_by = EXCLUDED.linked_by
        RETURNING id, workspace_id, contact_id, icloud_contact_id, link_type, phone_norm, link_status, confidence_score, linked_at, linked_by
        """,
        (
            ctx.workspace_id,
            crm_contact_id,
            icloud_contact_id,
            link_type,
            phone_norm,
            "active",
            0.8 if link_type == 'manual' else 0.9,
            user.user_id,
        ),
    )
    
    conn.commit()
    
    return {
        "id": link["id"],
        "workspace_id": link["workspace_id"],
        "crm_contact_id": link["contact_id"],
        "icloud_contact_id": link["icloud_contact_id"],
        "link_type": link["link_type"],
        "matched_phone_norm": link["phone_norm"],
        "link_status": link["link_status"],
        "confidence_score": link["confidence_score"],
        "linked_at": link["linked_at"],
        "linked_by": link["linked_by"],
    }


def list_icloud_contacts(
    conn,
    ctx: WorkspaceContext,
    limit: int = 50,
    cursor: Optional[str] = None,
    q: Optional[str] = None,
) -> tuple[List[Dict], Optional[str]]:
    """Получает список iCloud контактов.
    
    Args:
        conn: Соединение с БД
        ctx: Контекст workspace
        limit: Максимальное количество контактов
        cursor: Курсор для пагинации
        q: Поисковый запрос (по имени, телефону, компании)
        
    Returns:
        Кортеж (список контактов, следующий курсор)
    """
    # Проверяем, что аккаунт подключен
    account = fetchone(
        conn,
        """
        SELECT id FROM icloud_accounts
        WHERE workspace_id = %s
        """,
        (ctx.workspace_id,),
    )
    
    if not account:
        return [], None
    
    # Строим запрос с фильтрацией
    where_clauses = [
        "ic.workspace_id = %s",
        "ic.icloud_account_id = %s",
        "ic.deleted_at IS NULL",
    ]
    params = [ctx.workspace_id, account["id"]]
    
    if q:
        search_term = f"%{q.lower()}%"
        where_clauses.append(
            "(LOWER(ic.display_name) LIKE %s OR LOWER(ic.company) LIKE %s OR EXISTS (SELECT 1 FROM jsonb_array_elements(ic.phones) AS phone WHERE LOWER(phone->>'value') LIKE %s))"
        )
        params.extend([search_term, search_term, search_term])
    
    where_sql = " AND ".join(where_clauses)
    
    # Обрабатываем курсор
    offset = 0
    if cursor:
        try:
            cursor_data = decode_cursor(cursor)
            offset = cursor_data.get("offset", 0)
        except:
            pass
    
    # Получаем контакты
    contacts = fetchall(
        conn,
        f"""
        SELECT 
            ic.id, ic.workspace_id, ic.remote_uri, ic.etag, ic.display_name,
            ic.given_name, ic.middle_name, ic.family_name,
            ic.company, ic.department, ic.job_title,
            ic.phones, ic.emails, ic.last_synced_at,
            ic.created_at, ic.updated_at, ic.vcard_raw
        FROM icloud_contacts ic
        WHERE {where_sql}
        ORDER BY ic.display_name NULLS LAST, ic.created_at DESC
        LIMIT %s OFFSET %s
        """,
        params + [limit + 1, offset],
    )
    
    # Проверяем, есть ли следующая страница
    has_next = len(contacts) > limit
    if has_next:
        contacts = contacts[:limit]
    
    # Получаем данные о связях для каждого контакта
    result = []
    for contact in contacts:
        # Получаем связь
        link = fetchone(
            conn,
            """
            SELECT 
                id, workspace_id, contact_id, icloud_contact_id,
                link_type, phone_norm, link_status, confidence_score,
                linked_at, linked_by
            FROM icloud_contact_links
            WHERE workspace_id = %s AND icloud_contact_id = %s AND link_status = 'active'
            """,
            (ctx.workspace_id, contact["id"]),
        )
        
        link_data = None
        if link:
            link_data = {
                "id": link["id"],
                "workspace_id": link["workspace_id"],
                "crm_contact_id": link["contact_id"],
                "icloud_contact_id": link["icloud_contact_id"],
                "link_type": link["link_type"],
                "matched_phone_norm": link["phone_norm"],
                "link_status": link["link_status"],
                "confidence_score": link["confidence_score"],
                "linked_at": link["linked_at"],
                "linked_by": link["linked_by"],
            }
        
        # Парсим JSON поля
        phones_raw = contact.get("phones")
        if phones_raw:
            phones_data = json.loads(phones_raw) if isinstance(phones_raw, str) else phones_raw
        else:
            phones_data = []
        
        emails_raw = contact.get("emails")
        if emails_raw:
            emails_data = json.loads(emails_raw) if isinstance(emails_raw, str) else emails_raw
        else:
            emails_data = []
        
        result.append({
            "id": str(contact["id"]),
            "workspace_id": str(contact["workspace_id"]),
            "remote_uri": contact["remote_uri"],
            "etag": contact["etag"],
            "display_name": contact["display_name"],
            "structured_name": {
                "given_name": contact.get("given_name"),
                "middle_name": contact.get("middle_name"),
                "family_name": contact.get("family_name"),
            } if any([contact.get("given_name"), contact.get("middle_name"), contact.get("family_name")]) else None,
            "company": contact.get("company"),
            "job_title": contact.get("job_title"),
            "department": contact.get("department"),
            "phones": phones_data,
            "emails": emails_data,
            "synced_at": contact["last_synced_at"],
            "link": link_data,
            "created_at": contact["created_at"],
            "updated_at": contact["updated_at"],
        })
    
    # Формируем следующий курсор
    next_cursor = None
    if has_next:
        next_cursor = encode_cursor({"offset": offset + limit})
    
    return result, next_cursor


def get_icloud_contact(
    conn,
    ctx: WorkspaceContext,
    icloud_contact_id: UUID,
) -> Dict:
    """Получает детали iCloud контакта.
    
    Returns:
        Словарь с данными контакта
        
    Raises:
        HTTPException: Если контакт не найден
    """
    # Проверяем, что аккаунт подключен
    account = fetchone(
        conn,
        """
        SELECT id FROM icloud_accounts
        WHERE workspace_id = %s
        """,
        (ctx.workspace_id,),
    )
    
    if not account:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud аккаунт не подключен"},
        )
    
    # Получаем контакт
    contact = fetchone(
        conn,
        """
        SELECT 
            id, workspace_id, remote_uri, etag, display_name,
            given_name, middle_name, family_name,
            company, department, job_title,
            phones, emails, vcard_raw, last_synced_at,
            created_at, updated_at
        FROM icloud_contacts
        WHERE id = %s AND workspace_id = %s AND icloud_account_id = %s AND deleted_at IS NULL
        """,
        (icloud_contact_id, ctx.workspace_id, account["id"]),
    )
    
    if not contact:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "iCloud контакт не найден"},
        )
    
    # Парсим JSON поля
    phones_raw = contact.get("phones")
    if phones_raw:
        phones_data = json.loads(phones_raw) if isinstance(phones_raw, str) else phones_raw
    else:
        phones_data = []
    
    emails_raw = contact.get("emails")
    if emails_raw:
        emails_data = json.loads(emails_raw) if isinstance(emails_raw, str) else emails_raw
    else:
        emails_data = []
    
    # Проверяем наличие связи
    link = fetchone(
        conn,
        """
        SELECT 
            id, workspace_id, contact_id, icloud_contact_id,
            link_type, phone_norm, link_status, confidence_score,
            linked_at, linked_by
        FROM icloud_contact_links
        WHERE workspace_id = %s AND icloud_contact_id = %s AND link_status = 'active'
        """,
        (ctx.workspace_id, contact["id"]),
    )
    
    link_data = None
    if link:
        link_data = {
            "id": link["id"],
            "workspace_id": link["workspace_id"],
            "crm_contact_id": link["contact_id"],
            "icloud_contact_id": link["icloud_contact_id"],
            "link_type": link["link_type"],
            "matched_phone_norm": link["phone_norm"],
            "link_status": link["link_status"],
            "confidence_score": link["confidence_score"],
            "linked_at": link["linked_at"],
            "linked_by": link["linked_by"],
        }
    
    # Парсим vCard для получения дополнительных полей (адреса, URL, мессенджеры, даты, заметки)
    vcard_raw = contact.get("vcard_raw")
    structured_name_with_prefix_suffix = None
    
    if vcard_raw:
        try:
            parsed = parse_vcard(vcard_raw)
            addresses = parsed.get("addresses", [])
            urls = parsed.get("urls", [])
            ims = parsed.get("ims", [])
            dates = parsed.get("dates", [])
            notes = parsed.get("notes")
            
            # Обновляем structured_name с prefix и suffix из vCard если они есть
            if parsed.get("structured_name"):
                vcard_name = parsed["structured_name"]
                if any([contact.get("given_name"), contact.get("middle_name"), contact.get("family_name"), vcard_name.get("prefix"), vcard_name.get("suffix")]):
                    structured_name_with_prefix_suffix = {
                        "given_name": contact.get("given_name") or vcard_name.get("given_name"),
                        "middle_name": contact.get("middle_name") or vcard_name.get("middle_name"),
                        "family_name": contact.get("family_name") or vcard_name.get("family_name"),
                        "prefix": vcard_name.get("prefix"),
                        "suffix": vcard_name.get("suffix"),
                    }
        except Exception as e:
            logger.warning(f"Error parsing vCard for contact {icloud_contact_id}: {e}")
            addresses = []
            urls = []
            ims = []
            dates = []
            notes = None
    else:
        addresses = []
        urls = []
        ims = []
        dates = []
        notes = None
    
    # Используем structured_name с prefix/suffix если есть, иначе базовый
    final_structured_name = structured_name_with_prefix_suffix
    if not final_structured_name:
        final_structured_name = {
            "given_name": contact.get("given_name"),
            "middle_name": contact.get("middle_name"),
            "family_name": contact.get("family_name"),
            "prefix": None,
            "suffix": None,
        } if any([contact.get("given_name"), contact.get("middle_name"), contact.get("family_name")]) else None
    
    return {
        "id": contact["id"],
        "workspace_id": contact["workspace_id"],
        "remote_uri": contact["remote_uri"],
        "etag": contact["etag"],
        "display_name": contact["display_name"],
        "structured_name": final_structured_name,
        "company": contact.get("company"),
        "job_title": contact.get("job_title"),
        "department": contact.get("department"),
        "phones": phones_data,
        "emails": emails_data,
        "addresses": addresses,
        "urls": urls,
        "ims": ims,
        "dates": dates,
        "notes": notes,
        "synced_at": contact["last_synced_at"],
        "link": link_data,
        "created_at": contact["created_at"],
        "updated_at": contact["updated_at"],
    }
