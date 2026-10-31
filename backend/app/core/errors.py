"""One error format for the whole API:
{ "error": { "code": "...", "message": "...", "details": {...}, "request_id": "..." } }
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("suryaops")


class AppError(Exception):
    """A business-rule or domain error with a stable code and a human message."""

    def __init__(self, code: str, message: str, status: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}
        super().__init__(message)


def not_found(entity: str, ident) -> AppError:
    return AppError("NOT_FOUND", f"{entity} not found.", 404, {"id": ident})


def _body(request: Request, code: str, message: str, details: dict | None = None) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return JSONResponse(_body(request, exc.code, exc.message, exc.details), exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields = {}
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"] if p not in ("body", "query", "path"))
            fields[loc or "request"] = err["msg"]
        return JSONResponse(
            _body(request, "VALIDATION_ERROR", "Some fields need attention.", {"fields": fields}), 422
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        codes = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
        return JSONResponse(
            _body(request, codes.get(exc.status_code, "HTTP_ERROR"), str(exc.detail)), exc.status_code
        )

    @app.exception_handler(StaleDataError)
    async def stale(request: Request, exc: StaleDataError):
        return JSONResponse(
            _body(request, "STALE_VERSION",
                  "This record was updated by someone else. Refresh to see the latest."), 409
        )

    @app.exception_handler(IntegrityError)
    async def integrity(request: Request, exc: IntegrityError):
        # The database is the last line of defence (unique serials, amount_paid <= total, ...)
        log.warning("integrity_error", extra={"error": str(exc.orig)})
        return JSONResponse(
            _body(request, "CONFLICT",
                  "That change conflicts with existing data (duplicate or invalid value)."), 409
        )

    @app.exception_handler(RateLimitExceeded)
    async def rate_limited(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            _body(request, "RATE_LIMITED", "Too many requests. Please wait a moment and try again."), 429
        )

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        log.exception("unhandled_error", extra={"request_id": getattr(request.state, "request_id", None)})
        return JSONResponse(
            _body(request, "INTERNAL_ERROR",
                  "Something went wrong on our side. Please try again; quote the request ID if it persists."),
            500,
        )
