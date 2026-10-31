"""Rayora API entry point."""
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler  # noqa: F401  (handler registered in errors.py)

from app.core.config import settings
from app.core.errors import register_error_handlers
from app.core.logging import RequestContextMiddleware, setup_logging
from app.core.ratelimit import limiter
from app.routers import core, crm, ops, sales, service

setup_logging()

app = FastAPI(title="Rayora API", version="1.0.0",
              description="Rooftop solar operations: CRM → survey → quote → stock → dispatch → install → "
                          "subsidy → service → profit.")
app.state.limiter = limiter
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["x-request-id"])
app.add_middleware(RequestContextMiddleware)
register_error_handlers(app)

API = "/api/v1"
for r in (core.router, crm.router, sales.router, ops.router, service.router, service.public):
    app.include_router(r, prefix=API)

settings.upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


# In production the built React app is served from here too: one service, one URL, no CORS.
DIST = settings.frontend_dist
if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith(("api/", "uploads/", "docs", "openapi.json")):
            from app.core.errors import AppError
            raise AppError("NOT_FOUND", "Not Found", 404)
        file = DIST / path
        if path and file.is_file() and DIST in file.resolve().parents:
            return FileResponse(file)
        return FileResponse(DIST / "index.html")  # React Router handles the page
else:
    @app.get("/")
    def root():
        return {"name": "Rayora API", "docs": "/docs", "health": f"{API}/health"}