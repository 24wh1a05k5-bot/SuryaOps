import os

# Point everything at the test database BEFORE the app is imported
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://suryaops:suryaops@localhost:5432/suryaops_test")
os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256-ok"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def seeded():
    from app.seed import seed
    seed.reset()
    seed.run()
    # restore the real clock for the tests themselves
    from datetime import datetime, timezone
    seed._clock["t"] = datetime.now(timezone.utc)
    import app.services.common as common
    for mod in (seed.common, seed.crm, seed.sales, seed.stock, seed.field, seed.support, seed.finance,
                seed.reports, seed.serializers):
        mod.now = lambda: datetime.now(timezone.utc)
    yield


@pytest.fixture(scope="session")
def client():
    from app.main import app
    from app.core.ratelimit import limiter
    limiter.enabled = False
    return TestClient(app)


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return _login(client, "director@sunpower.in")


@pytest.fixture(scope="session")
def tech(client):
    return _login(client, "ravi@sunpower.in")
