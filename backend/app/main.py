from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from app.api.v1.router import router as v1_router
from app.db.session import create_pool


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if os.getenv("DISABLE_DB") != "1":
            app.state.pool = create_pool()
        yield
        pool = getattr(app.state, "pool", None)
        if pool:
            pool.close()

    app = FastAPI(title="PersonalCRM", version="0.1.0", lifespan=lifespan)

    # CORS for local dev (Vite / preview)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ],
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_class=PlainTextResponse)
    def health() -> str:
        return "ok"

    @app.get("/openapi.yaml")
    def openapi_yaml() -> PlainTextResponse:
        # Prefer mounted /openapi volume (docker-compose)
        candidates = [
            Path("/openapi/personalcrm_openapi_v1.yaml"),
            Path(__file__).resolve().parent.parent / "openapi" / "personalcrm_openapi_v1.yaml",
        ]
        for p in candidates:
            if p.exists():
                return PlainTextResponse(p.read_text(encoding="utf-8"), media_type="text/yaml")
        return PlainTextResponse(
            "Файл OpenAPI не найден. Убедитесь, что каталог openapi/ смонтирован.",
            status_code=404,
            media_type="text/plain",
        )

    app.include_router(v1_router)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Ошибка валидации",
                    "details": {"errors": exc.errors()},
                }
            },
        )
    return app


app = create_app()
