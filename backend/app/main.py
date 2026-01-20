from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.v1.router import router as v1_router
from app.db.session import create_pool


def create_app() -> FastAPI:
    app = FastAPI(title="PersonalCRM", version="0.1.0")

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

    @app.on_event("startup")
    def _startup() -> None:
        app.state.pool = create_pool()

    @app.on_event("shutdown")
    def _shutdown() -> None:
        pool = getattr(app.state, "pool", None)
        if pool:
            pool.close()

    @app.get("/health", response_class=PlainTextResponse)
    def health() -> str:
        return "ok"

    @app.get("/openapi.yaml", response_class=PlainTextResponse)
    def openapi_yaml() -> str:
        # Prefer mounted /openapi volume (docker-compose)
        candidates = [
            Path("/openapi/personalcrm_openapi_v1.yaml"),
            Path(__file__).resolve().parent.parent / "openapi" / "personalcrm_openapi_v1.yaml",
        ]
        for p in candidates:
            if p.exists():
                return p.read_text(encoding="utf-8")
        return "# OpenAPI file not found. Ensure openapi/ is mounted."

    app.include_router(v1_router)
    return app


app = create_app()
