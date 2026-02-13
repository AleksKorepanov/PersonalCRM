"""Mock CardDAV сервер для тестирования и разработки.

Реализует минимальный протокол CardDAV достаточный для операций:
- discover (PROPFIND на /.well-known/carddav)
- list addressbooks (PROPFIND на /carddavhome/)
- fetch contact (GET на /carddavhome/{filename})
- create contact (PUT на /carddavhome/{filename})

Данные хранятся в файловой системе для детерминированности тестов.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Response, status
from fastapi.responses import PlainTextResponse
from starlette.routing import Route

app = FastAPI(title="Mock CardDAV Server")

# Базовая директория для хранения данных
DATA_DIR = Path("/data/carddav")
ADDRESSBOOK_DIR = DATA_DIR / "carddavhome"
ADDRESSBOOK_DIR.mkdir(parents=True, exist_ok=True)


def check_auth(request: Request) -> bool:
    """Проверяет базовую HTTP аутентификацию."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return False
    # Для mock сервера принимаем любые учетные данные
    return True


async def options_handler(request: Request, path: str = ""):
    """Обработчик OPTIONS запросов."""
    return Response(
        headers={
            "DAV": "1, 2, 3, addressbook",
            "Allow": "OPTIONS, PROPFIND, GET, PUT, DELETE",
        }
    )


async def discover(request: Request):
    """Discovery endpoint для CardDAV."""
    if not check_auth(request):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    
    xml_response = """<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
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
          <card:addressbook/>
        </d:resourcetype>
        <d:displayname>Contacts</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"""
    
    return Response(
        content=xml_response,
        media_type="application/xml; charset=utf-8",
        status_code=207,
    )


async def list_addressbooks(request: Request):
    """Список адресных книг и контактов."""
    if not check_auth(request):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    
    # Получаем список файлов vCard
    vcf_files = sorted(ADDRESSBOOK_DIR.glob("*.vcf"))
    
    # Формируем XML ответ
    responses = []
    
    # Добавляем саму адресную книгу
    responses.append(f"""  <d:response>
    <d:href>/carddavhome/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <card:addressbook xmlns:card="urn:ietf:params:xml:ns:carddav"/>
        </d:resourcetype>
        <d:displayname>Contacts</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>""")
    
    # Добавляем каждый контакт
    for vcf_file in vcf_files:
        filename = vcf_file.name
        # Читаем ETag из метаданных или генерируем на основе содержимого
        etag = str(uuid.uuid5(uuid.NAMESPACE_URL, str(vcf_file.stat().st_mtime)))
        
        responses.append(f"""  <d:response>
    <d:href>/carddavhome/{filename}</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"{etag}"</d:getetag>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>""")
    
    xml_response = f"""<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
{chr(10).join(responses)}
</d:multistatus>"""
    
    return Response(
        content=xml_response,
        media_type="application/xml; charset=utf-8",
        status_code=207,
    )


async def fetch_contact(request: Request, filename: str):
    """Получение контакта по имени файла."""
    if not check_auth(request):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    
    file_path = ADDRESSBOOK_DIR / filename
    
    if not file_path.exists():
        return Response(status_code=404)
    
    # Проверяем If-None-Match для условных запросов
    if_none_match = request.headers.get("If-None-Match")
    if if_none_match:
        # Для простоты всегда возвращаем контент
        pass
    
    vcard_content = file_path.read_text(encoding="utf-8")
    etag = str(uuid.uuid5(uuid.NAMESPACE_URL, str(file_path.stat().st_mtime)))
    
    return Response(
        content=vcard_content,
        media_type="text/vcard; charset=utf-8",
        headers={"ETag": f'"{etag}"'},
    )


async def create_contact(request: Request, filename: str):
    """Создание или обновление контакта."""
    if not check_auth(request):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    
    # Проверяем, что это vCard файл
    if not filename.endswith(".vcf"):
        return Response(status_code=400, content="Filename must end with .vcf")
    
    file_path = ADDRESSBOOK_DIR / filename
    vcard_content = request.body.decode("utf-8")
    
    # Проверяем If-Match для условных обновлений
    if_match = request.headers.get("If-Match")
    if if_match and file_path.exists():
        # Проверяем ETag
        current_etag = str(uuid.uuid5(uuid.NAMESPACE_URL, str(file_path.stat().st_mtime)))
        if if_match.strip('"') != current_etag:
            return Response(status_code=412)  # Precondition Failed
    
    # Сохраняем файл
    file_path.write_text(vcard_content, encoding="utf-8")
    
    # Генерируем новый ETag
    etag = str(uuid.uuid5(uuid.NAMESPACE_URL, str(file_path.stat().st_mtime)))
    
    status_code = 201 if not file_path.exists() else 204
    
    return Response(
        status_code=status_code,
        headers={"ETag": f'"{etag}"', "Location": f"/carddavhome/{filename}"},
    )


async def delete_contact(request: Request, filename: str):
    """Удаление контакта."""
    if not check_auth(request):
        return Response(status_code=401, headers={"WWW-Authenticate": "Basic"})
    
    file_path = ADDRESSBOOK_DIR / filename
    
    if not file_path.exists():
        return Response(status_code=404)
    
    file_path.unlink()
    return Response(status_code=204)


async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Регистрируем маршруты с поддержкой PROPFIND
app.add_api_route("/.well-known/carddav", discover, methods=["PROPFIND", "OPTIONS"])
app.add_api_route("/carddavhome/", list_addressbooks, methods=["PROPFIND", "OPTIONS"])
app.add_api_route("/carddavhome/{filename:path}", fetch_contact, methods=["GET", "OPTIONS"])
app.add_api_route("/carddavhome/{filename:path}", create_contact, methods=["PUT", "OPTIONS"])
app.add_api_route("/carddavhome/{filename:path}", delete_contact, methods=["DELETE", "OPTIONS"])
app.add_api_route("/health", health, methods=["GET"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
