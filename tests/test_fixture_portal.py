"""The portal's contract, which is mostly about what it does NOT say.

The portal renders fixtures full-bleed into a webcam's field of view. Anything
the page can show, the model can read -- so a scanner that scores well because
it read "grey wolf" off the screen has measured the font. The default response
carrying no ground truth is the property worth protecting here; it is one
keyword away from being lost in a refactor, and losing it would not fail
anything else.
"""

import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(main_module):
    return TestClient(main_module.app)


@pytest.fixture
def fixture_dir(main_module, tmp_path, monkeypatch):
    """A fixture set on disk, with ground truth beside it."""
    (tmp_path / "dogs").mkdir()
    (tmp_path / "notdogs").mkdir()
    (tmp_path / "dogs" / "dog_01.jpg").write_bytes(b"\xff\xd8\xff")
    (tmp_path / "notdogs" / "notdog_01.jpg").write_bytes(b"\xff\xd8\xff")
    (tmp_path / "fixtures.json").write_text(
        json.dumps(
            {
                "dog_01.jpg": {"is_dog": True, "subject": "beagle"},
                "notdog_01.jpg": {"is_dog": False, "subject": "grey wolf"},
            }
        )
    )
    monkeypatch.setattr(main_module, "FIXTURE_DIR", str(tmp_path))
    return tmp_path


def test_listing_withholds_ground_truth_by_default(client, fixture_dir):
    """The default response must be safe to render into a camera frame."""
    body = client.get("/api/fixtures").json()

    assert len(body["fixtures"]) == 2
    assert body["revealed"] is False
    for item in body["fixtures"]:
        assert "truth" not in item

    # The strong form: no ground-truth word appears anywhere in the payload,
    # however it might have been nested. Asserting on keys alone would pass a
    # response that leaked the subject under some other name.
    raw = json.dumps(body).lower()
    for leaked in ("beagle", "grey wolf", "is_dog", "subject"):
        assert leaked not in raw, f"{leaked!r} reached the page"


def test_reveal_is_opt_in_and_complete(client, fixture_dir):
    body = client.get("/api/fixtures?reveal=1").json()

    assert body["revealed"] is True
    truths = {f["name"]: f["truth"] for f in body["fixtures"]}
    assert truths["dog_01.jpg"] == {"is_dog": True, "subject": "beagle"}
    assert truths["notdog_01.jpg"] == {"is_dog": False, "subject": "grey wolf"}


def test_both_labels_are_listed(client, fixture_dir):
    """notdogs are half the eval, and the half easier to forget to serve."""
    urls = [f["url"] for f in client.get("/api/fixtures").json()["fixtures"]]
    assert "/fixtures/dogs/dog_01.jpg" in urls
    assert "/fixtures/notdogs/notdog_01.jpg" in urls


def test_missing_fixture_dir_is_not_an_error(client, main_module, monkeypatch, tmp_path):
    """Before any photos land, the portal should say "none" rather than 500."""
    monkeypatch.setattr(main_module, "FIXTURE_DIR", str(tmp_path / "nope"))
    r = client.get("/api/fixtures")
    assert r.status_code == 200
    assert r.json()["fixtures"] == []
