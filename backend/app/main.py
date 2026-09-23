import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import auth, catalog, orders
from app.routers.admin import router as admin_router

logging.basicConfig(level=logging.INFO)

settings = get_settings()
settings.media_dir.mkdir(parents=True, exist_ok=True)
if settings.jwt_secret == "change-me-in-production":
    logging.getLogger(__name__).warning("JWT_SECRET is the default value — set it in production!")

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(auth.me_router, prefix=api_prefix)
app.include_router(catalog.router, prefix=api_prefix)
app.include_router(orders.router, prefix=api_prefix)
app.include_router(admin_router, prefix=api_prefix)

app.mount(settings.media_url_prefix, StaticFiles(directory=settings.media_dir), name="media")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}
