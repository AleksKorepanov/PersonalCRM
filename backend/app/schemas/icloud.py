"""Схемы данных для iCloud интеграции."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class ICloudConnectRequest(BaseModel):
    """Запрос на подключение iCloud аккаунта."""
    apple_id: EmailStr = Field(..., description="Apple ID (email адрес)")
    app_password: str = Field(..., min_length=16, description="App-specific password (формат xxxx-xxxx-xxxx-xxxx)")


class ICloudAccount(BaseModel):
    """iCloud аккаунт."""
    id: UUID
    workspace_id: UUID
    apple_id: EmailStr = Field(..., description="Apple ID (замаскирован для безопасности)")
    sync_enabled: bool = Field(..., description="Включена ли автоматическая синхронизация")
    last_sync_at: Optional[datetime] = Field(None, description="Время последней успешной синхронизации")
    sync_error: Optional[str] = Field(None, description="Текст последней ошибки синхронизации (если есть)")
    created_at: datetime
    updated_at: datetime


class StructuredName(BaseModel):
    """Структурированное имя контакта."""
    given_name: Optional[str] = Field(None, description="Имя")
    middle_name: Optional[str] = Field(None, description="Отчество")
    family_name: Optional[str] = Field(None, description="Фамилия")
    prefix: Optional[str] = Field(None, description="Префикс (г-н, г-жа и т.п.)")
    suffix: Optional[str] = Field(None, description="Суффикс (Jr., Sr. и т.п.)")


class ContactPhone(BaseModel):
    """Телефон контакта."""
    label: Optional[str] = Field(None, description="Метка (mobile, work, home и т.п.)")
    value: str = Field(..., description="Номер телефона")
    is_primary: Optional[bool] = Field(None, description="Основной телефон")


class ContactEmail(BaseModel):
    """Email контакта."""
    label: Optional[str] = Field(None, description="Метка (work, home и т.п.)")
    value: EmailStr = Field(..., description="Email адрес")
    is_primary: Optional[bool] = Field(None, description="Основной email")


class ContactLinkRequest(BaseModel):
    """Запрос на связывание iCloud контакта с CRM контактом."""
    crm_contact_id: UUID = Field(..., description="ID CRM контакта для связывания")
    link_type: str = Field("manual", description="Тип связывания (auto, manual, phone_match, email_match)")


class ContactLink(BaseModel):
    """Связь между iCloud и CRM контактом."""
    id: UUID
    workspace_id: UUID
    crm_contact_id: UUID = Field(..., description="ID CRM контакта")
    icloud_contact_id: UUID = Field(..., description="ID iCloud контакта")
    link_type: str = Field(..., description="Тип связывания")
    matched_phone_norm: Optional[str] = Field(None, description="Нормализованный телефон, по которому было найдено совпадение")
    link_status: str = Field("active", description="Статус связи (active, conflict, resolved)")
    confidence_score: Optional[int] = Field(None, ge=1, le=100, description="Уровень уверенности в связывании")
    linked_at: datetime
    linked_by: Optional[UUID] = Field(None, description="ID пользователя, создавшего связь")


class ICloudContact(BaseModel):
    """iCloud контакт."""
    id: UUID
    workspace_id: UUID
    remote_uri: str = Field(..., description="URI ресурса в iCloud CardDAV")
    etag: str = Field(..., description="ETag для отслеживания изменений")
    display_name: Optional[str] = Field(None, description="Отображаемое имя контакта")
    structured_name: Optional[StructuredName] = Field(None, description="Структурированное имя")
    company: Optional[str] = Field(None, description="Название компании")
    job_title: Optional[str] = Field(None, description="Должность")
    department: Optional[str] = Field(None, description="Отдел")
    phones: List[ContactPhone] = Field(default_factory=list, description="Телефоны")
    emails: List[ContactEmail] = Field(default_factory=list, description="Email адреса")
    synced_at: datetime = Field(..., description="Время последней синхронизации")
    link: Optional[ContactLink] = Field(None, description="Связь с CRM контактом (если есть)")
    created_at: datetime
    updated_at: datetime
