from unittest.mock import MagicMock, patch

from icloudpd_web.config import AppriseSettings
from icloudpd_web.integrations.apprise_notifier import AppriseNotifier


def test_empty_urls_no_op() -> None:
    n = AppriseNotifier(AppriseSettings())
    n.emit("success", policy_name="p", summary="ok")  # must not raise


def test_emit_respects_event_toggles() -> None:
    settings = AppriseSettings(
        urls=["mailto://x"], on_start=True, on_success=False, on_failure=True
    )
    with patch("icloudpd_web.integrations.apprise_notifier.apprise.Apprise") as cls:
        inst = MagicMock()
        cls.return_value = inst
        n = AppriseNotifier(settings)
        n.emit("success", policy_name="p", summary="ok")
        inst.notify.assert_not_called()
        n.emit("start", policy_name="p", summary="starting")
        assert inst.notify.call_count == 1
        n.emit("failure", policy_name="p", summary="boom")
        assert inst.notify.call_count == 2


def test_notify_error_never_raises() -> None:
    settings = AppriseSettings(urls=["mailto://x"], on_failure=True)
    with patch("icloudpd_web.integrations.apprise_notifier.apprise.Apprise") as cls:
        inst = MagicMock()
        inst.notify.side_effect = RuntimeError("network down")
        cls.return_value = inst
        n = AppriseNotifier(settings)
        n.emit("failure", policy_name="p", summary="boom")  # must not raise
