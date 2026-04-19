# Manual testing against real icloudpd and iCloud

The automated test suite mocks `icloudpd` entirely (see `tests/fixtures/fake_icloudpd.py`). Before a release, run the checks below against the real binary — and, for major changes, a throwaway iCloud account — to catch anything the mock missed.

## Gate 1 — upstream flag compatibility (fully automated)

```bash
make check-upstream
```

Runs `scripts/check_upstream.py` against the installed `icloudpd`. Asserts every flag the wrapper may emit still exists in `icloudpd --help`. Fails if upstream renamed or removed a flag we depend on.

No network, no credentials. Do this every time the `icloudpd` pin changes.

## Gate 2 — real-icloudpd argv syntax (opt-in, ~20 seconds)

```bash
ICLOUDPD_REAL_TEST=1 uv run pytest tests/runner/test_real_icloudpd_syntax.py -v
```

Spawns the real `icloudpd` with a representative argv, feeds a bogus password, and asserts:
- argparse accepts every flag we emit
- `--password-provider console` reads our stdin correctly
- The binary reaches the authentication stage (bogus credentials fail cleanly)

Requires network — hits Apple's auth endpoints, gets a 401/403. Does not require iCloud credentials.

Skipped by default so regular `uv run pytest` stays hermetic.

## Gate 3 — end-to-end live smoke (manual, ~5 minutes)

Run against a throwaway iCloud account before any release that touches the runner, config builder, MFA flow, or subprocess plumbing. You need:

- An iCloud account you're willing to authenticate with on this machine (a disposable one is fine — it just needs to own a small album).
- Two-factor authentication enabled (so the MFA path is exercised).

### Steps

1. Start the backend with a scratch data directory:
   ```bash
   uv run icloudpd-web --data-dir ./.dev-data --host 127.0.0.1 --port 8000
   ```
   In another shell start the frontend dev server:
   ```bash
   cd web && npm run dev
   ```
   Open http://localhost:5173.

2. If the UI prompts for a server password, set one and log in.

3. Create a new policy:
   - **Username:** your iCloud email
   - **Directory:** `./.dev-data/photos` (or any writable local path)
   - **Album:** pick a small album (e.g. *Selfies*) so the run completes fast
   - **Recent:** `5` (cap the download)
   - **Dry run:** on (no files actually written)
   - **Cron:** leave the default — we'll trigger manually
   - Save.

4. Set the policy password via the UI.

5. Click **Run**. Verify in order:
   - Row status transitions to **running**.
   - Progress bar updates as lines appear in the log.
   - When icloudpd prompts for MFA, the MFA modal opens. Enter the code from your Apple device. The modal closes and the run resumes.
   - Row status settles on **done**, with a green bar.
   - Expand the row: the log shows a completion summary.
   - Reload the page: the row still shows **done** and the last-run timestamp (run-status sidecar persistence).

6. Trigger a **failure** path: create a second policy with a wrong password, run it, verify the row ends in the **error** state and the log shows the auth error.

7. Trigger an **interrupt**: run the first policy with `Recent: 100` and press the pause button mid-run. Verify the row ends in **stopped**.

8. If you exercise AWS sync (optional): add an S3 block with real bucket/prefix and a test directory; run; verify the files appear in S3.

9. If you exercise Apprise (optional): add an Apprise URL in Settings that points somewhere you can watch (e.g. a private Discord webhook); run; verify the notification arrives.

### Clean up

```bash
rm -rf ./.dev-data
```

## Gate 4 — release checklist

Releases are cut locally via `scripts/release.sh` — no CI/CD. The flow is split so you can inspect artifacts before anything leaves the machine.

Before cutting a release:

- [ ] `make test` — full hermetic suite green (also enforced by `prepare`)
- [ ] `make check-upstream` — Gate 1 green (also enforced by `prepare`)
- [ ] `ICLOUDPD_REAL_TEST=1 uv run pytest tests/runner/test_real_icloudpd_syntax.py` — Gate 2 green
- [ ] Gate 3 manual smoke completed on at least one platform
- [ ] CHANGELOG entry added

If you bumped the `icloudpd` pin, Gate 2 and Gate 3 are mandatory.

### Cutting the release

```bash
scripts/release.sh prepare           # auto CalVer, or pass --version X.Y.Z
# inspect dist/ and the version-bump commit
scripts/release.sh publish           # needs UV_PUBLISH_TOKEN and prior 'docker login'
```

`prepare` bumps version in `pyproject.toml`, `src/icloudpd_web/__init__.py`, and `web/package.json`, commits, builds wheel + sdist, and tags locally. `publish` uploads to PyPI, builds+pushes the multi-arch Docker image, then pushes `main` and the tag.

To abort between stages:

```bash
git tag -d v<version>
git reset --hard HEAD~1
rm -rf dist/
```

Use `scripts/release.sh prepare --dry-run` to preview every command without mutating state.
