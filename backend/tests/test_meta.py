from sqlalchemy.exc import OperationalError

from app.db import get_db
from app.main import app


class _DatabaseDown:
    def execute(self, *args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))


def test_health_checks_the_database(client):
    assert client.get("/api/health").json() == {"status": "ok"}

    app.dependency_overrides[get_db] = lambda: _DatabaseDown()
    try:
        r = client.get("/api/health")
    finally:
        app.dependency_overrides.pop(get_db)
    assert r.status_code == 503


def test_browser_errors_are_logged_and_capped(client, caplog):
    body = {"message": "TypeError: x is undefined", "stack": "at f (page.js:1)", "url": "/cart"}
    with caplog.at_level("WARNING", logger="app.routers.meta"):
        assert client.post("/api/client-errors", json=body).status_code == 204
        assert "TypeError: x is undefined" in caplog.text and "/cart" in caplog.text

        # A page reporting in a loop doesn't flood the log: 60 a minute.
        for _ in range(80):
            assert client.post("/api/client-errors", json=body).status_code == 204
        assert caplog.text.count("Browser error") == 60

    assert client.post("/api/client-errors", json={"message": "x" * 2000}).status_code == 422
    assert client.post("/api/client-errors", json={"message": ""}).status_code == 422
