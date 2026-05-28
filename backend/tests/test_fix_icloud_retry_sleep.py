"""Regression test: iCloud retry delays are hardcoded — impossible to test without hanging.

Bug: icloud_service.connect() calls time.sleep(30) and time.sleep(60) directly.
     Tests cannot run without sleeping 90 seconds, or monkey-patching time.sleep globally.
Fix: accept an optional _sleep_fn parameter (default: time.sleep) so tests can inject a no-op.
"""
import pytest
from unittest.mock import patch, MagicMock, call
from services.icloud_service import connect


class FakePyiCloudAPIResponseException(Exception):
    pass


def test_icloud_retry_sleep_is_injectable():
    """connect() must accept a _sleep_fn kwarg so tests can verify delays without hanging."""
    import inspect
    sig = inspect.signature(connect)
    assert "_sleep_fn" in sig.parameters, (
        "connect() has no _sleep_fn parameter — retry delays cannot be mocked in tests"
    )


def test_icloud_retry_uses_correct_delays():
    """On 503, connect() should sleep 30s then 60s between the 3 attempts."""
    slept = []

    with patch("services.icloud_service.PyiCloudService") as MockAPI, \
         patch("services.icloud_service.PyiCloudAPIResponseException",
               FakePyiCloudAPIResponseException):
        MockAPI.side_effect = FakePyiCloudAPIResponseException("503 Service Unavailable")

        result = connect(
            profile_id="test",
            apple_id="test@example.com",
            password="pw",
            _sleep_fn=slept.append,
        )

    assert not result.connected
    assert slept == [30, 60], (
        f"Expected delays [30, 60] between 3 attempts, got {slept}"
    )


def test_icloud_retry_no_sleep_on_login_failure():
    """PyiCloudFailedLoginException must NOT trigger a retry — return immediately."""
    slept = []

    with patch("services.icloud_service.PyiCloudService") as MockAPI, \
         patch("services.icloud_service.PyiCloudFailedLoginException", ValueError):
        MockAPI.side_effect = ValueError("bad password")

        result = connect(
            profile_id="test",
            apple_id="test@example.com",
            password="wrong",
            _sleep_fn=slept.append,
        )

    assert not result.connected
    assert slept == [], f"No sleep expected on login failure, got {slept}"


def test_icloud_retry_success_no_sleep():
    """Successful login must not trigger any sleep."""
    slept = []
    mock_api = MagicMock()
    mock_api.requires_2fa = False

    with patch("services.icloud_service.PyiCloudService", return_value=mock_api):
        result = connect(
            profile_id="test",
            apple_id="ok@example.com",
            password="correct",
            _sleep_fn=slept.append,
        )

    assert result.connected
    assert slept == [], f"No sleep expected on success, got {slept}"
