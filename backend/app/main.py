from __future__ import annotations

import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, Tuple

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST, CollectorRegistry

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.db.session import create_pool


def create_app() -> FastAPI:
    registry = CollectorRegistry()
    request_counter = Counter(
        "http_requests_total",
        "Total HTTP requests",
        ["method", "path", "status"],
        registry=registry,
    )
    error_counter = Counter(
        "http_errors_total",
        "Total HTTP error responses",
        ["method", "path", "status"],
        registry=registry,
    )
    latency_histogram = Histogram(
        "http_request_duration_seconds",
        "HTTP request latency in seconds",
        ["method", "path", "status"],
        buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
        registry=registry,
    )
    rate_limits: Dict[str, Tuple[float, int]] = {}
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if os.getenv("DISABLE_DB") != "1":
            app.state.pool = create_pool()
        yield
        pool = getattr(app.state, "pool", None)
        if pool:
            pool.close()

    app = FastAPI(title="PersonalCRM", version="0.1.0", lifespan=lifespan)
    logger = logging.getLogger("personalcrm")
    allowed_origins = ["http://localhost:5173"]

    # CORS for local dev (Vite / preview)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        client_host = request.client.host if request.client else "unknown"
        key = f"ip:{client_host}"
        window_seconds = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", settings.rate_limit_window_seconds))
        rate_limit_env = os.getenv("RATE_LIMIT_PER_MINUTE")
        limit = int(rate_limit_env) if rate_limit_env else int(settings.rate_limit_per_minute)
        if settings.app_debug and rate_limit_env is None:
            limit = max(limit, 2000)
        now = time.monotonic()
        window_start, count = rate_limits.get(key, (now, 0))
        if now - window_start >= window_seconds:
            window_start, count = now, 0
        count += 1
        rate_limits[key] = (window_start, count)
        if count > limit:
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": {
                        "code": "RATE_LIMITED",
                        "message": "Слишком много запросов",
                        "request_id": request_id,
                    }
                },
            )
            response.headers["X-Request-Id"] = request_id
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Cross-Origin-Resource-Policy"] = "same-site"
            origin = request.headers.get("origin")
            if origin in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
            return response
        start = time.monotonic()
        try:
            response = await call_next(request)
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error(
                json.dumps(
                    {
                        "event": "request_error",
                        "method": request.method,
                        "path": request.url.path,
                        "status": 500,
                        "latency_ms": latency_ms,
                        "user_id": getattr(request.state, "user_id", None),
                        "workspace_id": getattr(request.state, "workspace_id", None),
                        "request_id": request_id,
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    },
                    ensure_ascii=False,
                )
            )
            raise
        latency_seconds = time.monotonic() - start
        latency_ms = int(latency_seconds * 1000)
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"
        path = request.url.path
        status = str(response.status_code)
        request_counter.labels(request.method, path, status).inc()
        latency_histogram.labels(request.method, path, status).observe(latency_seconds)
        if response.status_code >= 500:
            error_counter.labels(request.method, path, status).inc()
        logger.info(
            json.dumps(
                {
                    "event": "request",
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "latency_ms": latency_ms,
                    "user_id": getattr(request.state, "user_id", None),
                    "workspace_id": getattr(request.state, "workspace_id", None),
                    "request_id": request_id,
                },
                ensure_ascii=False,
            )
        )
        return response

    @app.get("/health")
    def health() -> JSONResponse:
        pool = getattr(app.state, "pool", None)
        if pool is None:
            return JSONResponse(content={"status": "ok", "db": "disabled"})
        try:
            with pool.connection() as conn:
                conn.execute("SELECT 1")
            return JSONResponse(content={"status": "ok", "db": "ok"})
        except Exception:
            return JSONResponse(status_code=503, content={"status": "degraded", "db": "down"})

    @app.get("/metrics")
    def metrics() -> Response:
        if not settings.app_debug:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Метрики отключены"})
        payload = generate_latest(registry)
        return Response(payload, media_type=CONTENT_TYPE_LATEST)

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

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = getattr(request.state, "request_id", None)
        logger.warning(
            json.dumps(
                {
                    "event": "http_error",
                    "method": request.method,
                    "path": request.url.path,
                    "status": exc.status_code,
                    "user_id": getattr(request.state, "user_id", None),
                    "workspace_id": getattr(request.state, "workspace_id", None),
                    "request_id": request_id,
                    "detail": exc.detail,
                },
                ensure_ascii=False,
            )
        )
        headers = {"X-Request-Id": request_id} if request_id else None
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", None)
        logger.warning(
            json.dumps(
                {
                    "event": "validation_error",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 422,
                    "user_id": getattr(request.state, "user_id", None),
                    "workspace_id": getattr(request.state, "workspace_id", None),
                    "request_id": request_id,
                    "errors": exc.errors(),
                },
                ensure_ascii=False,
            )
        )
        headers = {"X-Request-Id": request_id} if request_id else None
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Ошибка валидации",
                    "details": {"errors": exc.errors()},
                    "request_id": request_id,
                }
            },
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.error(
            json.dumps(
                {
                    "event": "unhandled_error",
                    "method": request.method,
                    "path": request.url.path,
                    "status": 500,
                    "user_id": getattr(request.state, "user_id", None),
                    "workspace_id": getattr(request.state, "workspace_id", None),
                    "request_id": request_id,
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        detail = {"code": "INTERNAL_ERROR", "message": "Внутренняя ошибка сервера", "request_id": request_id}
        if settings.app_debug:
            detail["debug"] = {"error_type": type(exc).__name__, "error": str(exc)}
        headers = {"X-Request-Id": request_id} if request_id else None
        return JSONResponse(status_code=500, content={"detail": detail}, headers=headers)
    return app


app = create_app()
