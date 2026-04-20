from icloudpd_web.runner.list_libraries import parse_library_names


def test_parses_bare_identifiers() -> None:
    log = "PrimarySync\nSharedSync-ABC-123\n"
    assert parse_library_names(log) == ["PrimarySync", "SharedSync-ABC-123"]


def test_filters_log_lines_and_prompts() -> None:
    log = (
        "2026-04-20 10:38:20 INFO     Processing user: me@example.com\n"
        "getpass.py:90: GetPassWarning: Can not control echo on the terminal.\n"
        "Warning: Password input may be echoed.\n"
        "iCloud Password for me@example.com:\n"
        "2026-04-20 10:38:22 INFO     Two-factor authentication is required (2fa)\n"
        "Please enter two-factor authentication code: 123456\n"
        "PrimarySync\n"
        "SharedSync-XYZ-789\n"
    )
    assert parse_library_names(log) == ["PrimarySync", "SharedSync-XYZ-789"]


def test_rejects_bare_log_levels() -> None:
    assert parse_library_names("INFO\nERROR\nDEBUG\n") == []


def test_dedupes() -> None:
    assert parse_library_names("PrimarySync\nPrimarySync\n") == ["PrimarySync"]


def test_blank_log_returns_empty() -> None:
    assert parse_library_names("") == []
