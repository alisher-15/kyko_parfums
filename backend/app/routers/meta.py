"""Service endpoints: the health check for the host and an uptime monitor, and browser errors."""

import logging

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.throttle import Throttle

log = logging.getLogger(__name__)
router = APIRouter(tags=["meta"])

# Browser error reports from all visitors together: behind the Next.js proxy they share one
# address, and a broken page must not flood the log.
client_errors = Throttle(limit=60, window=60)


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """The app answers and reaches its database: for the host's health check and a monitor."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        log.exception("Health check: the database does not answer")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "База данных недоступна") from None
    return {"status": "ok"}


class ClientError(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    stack: str | None = Field(default=None, max_length=8000)
    url: str | None = Field(default=None, max_length=1000)


@router.post("/client-errors", status_code=status.HTTP_204_NO_CONTENT)
def client_error(data: ClientError) -> Response:
    """A JavaScript error in a visitor's browser: written to the log, and to Sentry when set up."""
    if not client_errors.retry_after("all"):
        client_errors.hit("all")
        # A warning, so Sentry's logging hook doesn't report it a second time.
        log.warning("Browser error at %s: %s\n%s", data.url or "?", data.message, data.stack or "")
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("source", "browser")
            scope.set_context("browser", {"url": data.url, "stack": data.stack})
            sentry_sdk.capture_message(f"Browser: {data.message}", level="error")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
