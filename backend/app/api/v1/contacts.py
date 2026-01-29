from __future__ import annotations

from typing import Dict, List, Optional

import csv
import io
import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.core.deps import get_db, get_current_user, require_permission
from app.schemas.common import Paginated
from app.schemas.contacts import Contact, ContactCreate, ContactMergeRequest, ContactUpdate
from app.schemas.enums import TieStrength, Visibility
from app.services import contacts as contacts_svc

router = APIRouter()

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^\+?\d+$")


def _detect_delimiter(header_line: str) -> str:
    comma = header_line.count(",")
    semi = header_line.count(";")
    if semi > comma:
        return ";"
    return ","


def _split_list(value: str) -> List[str]:
    if not value:
        return []
    parts = re.split(r"[;,]", value)
    return [p.strip() for p in parts if p and p.strip()]


def _normalize_header(value: str) -> str:
    return value.strip().lower()


@router.get("/contacts", response_model=Paginated[Contact])
def list_contacts(
    workspace_id: str = Query(..., alias="workspace_id"),
    q: Optional[str] = Query(None),
    tags: Optional[List[str]] = Query(None),
    tier: Optional[TieStrength] = Query(None),
    visibility: Optional[Visibility] = Query(None),
    updated_since: Optional[str] = Query(None),
    sort: Optional[str] = Query("updated_desc"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.read")),
):
    data, next_cursor = contacts_svc.list_contacts(
        conn,
        ctx,
        limit=limit,
        cursor=cursor,
        q=q,
        tags=tags,
        tier=tier.value if tier else None,
        visibility=visibility.value if visibility else None,
        updated_since=updated_since,
        sort=sort or "updated_desc",
    )
    return {"data": data, "next_cursor": next_cursor}


@router.post("/contacts", status_code=201, response_model=Contact)
def create_contact(
    payload: ContactCreate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    return contacts_svc.create_contact(conn, ctx, user, payload)


@router.post("/contacts/import")
async def import_contacts_csv(
    workspace_id: str = Query(..., alias="workspace_id"),
    file: UploadFile = File(...),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    if os.getenv("IMPORT_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Импорт отключен"})

    data = await file.read()
    if not data:
        return {"imported": 0, "skipped": 0, "errors": []}

    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CSV", "message": "Файл должен быть в UTF-8"},
        )

    lines = text.splitlines()
    if not lines:
        return {"imported": 0, "skipped": 0, "errors": []}

    delimiter = _detect_delimiter(lines[0])
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CSV", "message": "Не удалось прочитать заголовки CSV"},
        )

    header_map: Dict[str, str] = {_normalize_header(name): name for name in reader.fieldnames}
    name_key = header_map.get("name")
    if not name_key:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_CSV", "message": "Не найдена колонка name"},
        )
    email_key = header_map.get("email")
    phone_key = header_map.get("phone")
    company_key = header_map.get("company")
    tags_key = header_map.get("tags")

    imported = 0
    skipped = 0
    errors: List[Dict[str, object]] = []

    for idx, row in enumerate(reader, start=2):
        raw_name = (row.get(name_key) or "").strip()
        raw_email = (row.get(email_key) or "").strip() if email_key else ""
        raw_phone = (row.get(phone_key) or "").strip() if phone_key else ""
        raw_company = (row.get(company_key) or "").strip() if company_key else ""
        raw_tags = (row.get(tags_key) or "").strip() if tags_key else ""

        if not raw_name:
            skipped += 1
            errors.append({"line": idx, "message": "Имя обязательно"})
            continue

        emails = _split_list(raw_email)
        phones = _split_list(raw_phone)
        tags = _split_list(raw_tags)

        invalid_email = next((e for e in emails if not EMAIL_RE.match(e)), None)
        if invalid_email:
            skipped += 1
            errors.append({"line": idx, "message": "Некорректный email"})
            continue

        invalid_phone = next((p for p in phones if not PHONE_RE.match(p)), None)
        if invalid_phone:
            skipped += 1
            errors.append({"line": idx, "message": "Некорректный телефон"})
            continue

        org_id = contacts_svc.get_or_create_organization(conn, ctx, user, raw_company) if raw_company else None

        payload = ContactCreate(
            display_name=raw_name,
            tie_strength=TieStrength.medium,
            visibility=Visibility.shared,
            emails=emails,
            phones=phones,
            tags=tags,
            organization_id=org_id,
        )
        try:
            contacts_svc.create_contact(conn, ctx, user, payload)
            imported += 1
        except HTTPException as exc:
            skipped += 1
            message = exc.detail.get("message") if isinstance(exc.detail, dict) else str(exc.detail)
            errors.append({"line": idx, "message": message or "Не удалось импортировать строку"})

    return {"imported": imported, "skipped": skipped, "errors": errors}


@router.post("/contacts/merge")
def merge_contacts(
    payload: ContactMergeRequest,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    if os.getenv("MERGE_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Слияние отключено"})
    return contacts_svc.merge_contacts(conn, ctx, user, payload.primary_contact_id, payload.merge_contact_ids)


@router.get("/contacts/duplicates")
def list_contact_duplicates(
    workspace_id: str = Query(..., alias="workspace_id"),
    similarity_threshold: float = Query(0.4, ge=0.0, le=1.0),
    conn=Depends(get_db),
    ctx=Depends(require_permission("contacts.read")),
):
    if os.getenv("DUPLICATES_ENABLED") != "1":
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Поиск дублей отключен"})

    visibility_filter = ""
    params_base = [ctx.workspace_id]
    if ctx.membership_role != "owner":
        visibility_filter = " AND c.visibility <> 'private' "

    email_sql = f"""
        SELECT lower(e) as value, array_agg(c.id ORDER BY c.id) as contact_ids
        FROM contacts c
        JOIN LATERAL jsonb_array_elements_text(c.emails) e ON true
        WHERE c.workspace_id = %s AND c.deleted_at IS NULL AND e <> ''{visibility_filter}
        GROUP BY lower(e)
        HAVING count(*) > 1
    """
    phone_sql = f"""
        SELECT lower(p) as value, array_agg(c.id ORDER BY c.id) as contact_ids
        FROM contacts c
        JOIN LATERAL jsonb_array_elements_text(c.phones) p ON true
        WHERE c.workspace_id = %s AND c.deleted_at IS NULL AND p <> ''{visibility_filter}
        GROUP BY lower(p)
        HAVING count(*) > 1
    """
    try:
        email_rows = conn.execute(email_sql, tuple(params_base)).fetchall()
        phone_rows = conn.execute(phone_sql, tuple(params_base)).fetchall()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"code": "DUPLICATES_ERROR", "message": "Не удалось выполнить поиск дублей"},
        ) from exc

    groups = []

    def add_group(reason: str, ids: List[str]):
        if len(ids) < 2:
            return
        contacts_map = contacts_svc.get_contacts_by_ids(conn, ctx, ids)
        primary_id = ids[0]
        primary = contacts_map.get(primary_id)
        candidates = [contacts_map.get(cid) for cid in ids[1:] if contacts_map.get(cid)]
        if not primary or not candidates:
            return
        groups.append({"reason": reason, "primary_contact": primary, "candidates": candidates})

    for row in email_rows:
        ids = [str(item) for item in row[1] or []]
        add_group("email", ids)

    for row in phone_rows:
        ids = [str(item) for item in row[1] or []]
        add_group("phone", ids)

    name_sql = f"""
        SELECT c1.id as primary_id, c2.id as candidate_id
        FROM contacts c1
        JOIN contacts c2
          ON c1.workspace_id = c2.workspace_id
         AND c1.id < c2.id
        WHERE c1.workspace_id = %s
          AND c1.deleted_at IS NULL
          AND c2.deleted_at IS NULL
          {visibility_filter.replace('c.', 'c1.')}
          {visibility_filter.replace('c.', 'c2.')}
          AND similarity(c1.display_name, c2.display_name) >= %s
    """
    try:
        name_rows = conn.execute(name_sql, (ctx.workspace_id, similarity_threshold)).fetchall()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"code": "DUPLICATES_ERROR", "message": "Не удалось выполнить поиск похожих имён"},
        ) from exc

    name_groups: Dict[str, List[str]] = {}
    for row in name_rows:
        primary_id = str(row[0])
        candidate_id = str(row[1])
        name_groups.setdefault(primary_id, []).append(candidate_id)

    for primary_id, candidates in name_groups.items():
        add_group("name", [primary_id, *candidates])

    return {"groups": groups}


@router.get("/contacts/{contact_id}", response_model=Contact)
def get_contact(
    contact_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    ctx=Depends(require_permission("contacts.read")),
):
    return contacts_svc.get_contact(conn, ctx, contact_id)


@router.patch("/contacts/{contact_id}", response_model=Contact)
def patch_contact(
    contact_id: str,
    payload: ContactUpdate,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    return contacts_svc.update_contact(conn, ctx, user, contact_id, payload)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(
    contact_id: str,
    workspace_id: str = Query(..., alias="workspace_id"),
    conn=Depends(get_db),
    user=Depends(get_current_user),
    ctx=Depends(require_permission("contacts.write")),
):
    contacts_svc.delete_contact(conn, ctx, user, contact_id)
    return None
