"""The mock server must answer everything the real one does.

Three separate bugs in this project have had the same shape: a route that exists
in the real backend and not in the environment people actually develop in.

    1. `/api/config` 404ing under the Vite dev proxy, which forwarded only /ws.
       Symptom: the header read AWAITING LINK -- the exact bug that endpoint was
       written to fix.
    2. `/api/fixtures` and `/api/config` missing from the mock server, which is
       the documented way to work on the UI without billing a session. Symptom:
       the portal said it could not reach the API.
    3. The same drift waiting to happen on the next endpoint added.

Every one failed soft. Nothing crashed, nothing logged an error, and the feature
just looked unfinished. This test is the thing that fails loudly instead: add an
endpoint to the real backend and forget the mock, and it goes red here.
"""

import importlib.util
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

ROOT = pathlib.Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def mock_module():
    spec = importlib.util.spec_from_file_location(
        "mock_server", ROOT / "mock" / "mock_server.py"
    )
    m = importlib.util.module_from_spec(spec)
    sys.modules["mock_server"] = m
    spec.loader.exec_module(m)
    return m


@pytest.fixture
def mock_client(mock_module):
    return TestClient(mock_module.app)


@pytest.fixture
def real_client(main_module):
    return TestClient(main_module.app)


def test_config_keys_match(mock_client, real_client):
    """Same shape, not same values -- the mock's values are deliberately fake."""
    real = real_client.get("/api/config").json()
    mock = mock_client.get("/api/config").json()
    assert set(mock) == set(real), (
        f"mock /api/config drifted: missing {set(real) - set(mock)}, "
        f"extra {set(mock) - set(real)}"
    )


def test_fixtures_contract_matches(mock_client, real_client):
    real = real_client.get("/api/fixtures").json()
    mock = mock_client.get("/api/fixtures").json()
    assert set(mock) == set(real)
    assert mock["revealed"] is False


def test_mock_withholds_ground_truth_too(mock_client):
    """The portal's one rule holds in mock mode, where it is used most."""
    for item in mock_client.get("/api/fixtures").json()["fixtures"]:
        assert "truth" not in item


def test_every_real_api_route_exists_in_the_mock(mock_module, main_module):
    """The general form, so the next endpoint cannot repeat this."""

    def api_paths(app):
        return {
            r.path
            for r in app.routes
            if getattr(r, "path", "").startswith("/api/")
        }

    missing = api_paths(main_module.app) - api_paths(mock_module.app)
    assert not missing, (
        f"these /api routes exist in the real backend but not the mock: {missing}. "
        "They will 404 under ./mock.sh and fail soft."
    )
