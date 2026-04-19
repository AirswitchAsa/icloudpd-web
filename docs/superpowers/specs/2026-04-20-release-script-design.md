# Release script hardening — design

## Goal

Replace the stale `build.sh` with a split `scripts/release.sh prepare | publish` flow. `prepare` enforces gates, bumps version, and builds artifacts locally (including a local-only git tag). `publish` pushes artifacts to PyPI, Docker Hub, and origin. Between the two, the human can inspect `dist/` and abort cleanly by deleting the local tag.

## Non-goals

- No GitHub Actions, no CI. This is a local-only flow.
- No automated Gate 2 / Gate 3 invocation. Script only reminds.
- No support for pre-releases, alphas, RCs. CalVer only.

## Versioning

- Compute today's date as `YYYY.M.D` (no zero-padding — matches prior releases like `2026.3.1`, `2026.4.19`).
- If `git ls-remote --tags origin` already contains `vYYYY.M.D`, auto-bump to `YYYY.M.D.post1`, `.post2`, etc. PEP 440-compliant post-release suffix.
- `--version X.Y.Z` override allowed for unusual cases (e.g. amending a failed release).

## `prepare` steps

1. **Preflight**
   - Fail unless on branch `main`.
   - Warn (no fail) if tree dirty.
   - Fail if `dist/` contains artifacts from a prior unpublished release (require manual cleanup).
2. **Version resolve** — compute per rules above; print final version.
3. **Gates (hard-fail)**
   - `make test`
   - `make check-upstream`
4. **Manual gate reminder** — print (no prompt): "Run Gate 2 and Gate 3 from docs/MANUAL_TESTING.md if this release touches runner/config/MFA/subprocess code."
5. **Bump files**
   - `pyproject.toml`: `version = "..."`
   - `src/icloudpd_web/__init__.py`: `__version__ = "..."`
   - `web/package.json`: `"version": "..."`
   - Commit as `Release v<version>`.
6. **Build**
   - `cd web && npm ci && npm run build` — produces frontend assets baked into Python package.
   - `uv build` — wheel + sdist in `dist/`.
   - **Skip local Docker build.** Multi-arch buildx can't `--load`, and the Dockerfile is deterministic. Docker is built at publish time.
7. **Tag locally** — `git tag v<version>` (no push).
8. **Exit summary** — print version, list `dist/` artifacts, instruct "inspect, then run `scripts/release.sh publish`".

## `publish` steps

1. **Preflight**
   - Verify local tag `v<version>` exists, where `<version>` is read from `pyproject.toml`.
   - Verify `dist/*.whl` and `dist/*.tar.gz` exist and match the version.
   - Fail if `UV_PUBLISH_TOKEN` unset.
   - Fail if `docker info` shows no authenticated user (proxy for `docker login`).
2. **PyPI** — `uv publish`.
3. **Docker** — `docker buildx build --platform linux/amd64,linux/arm64 --push --tag spicadust/icloudpd-web:<version> --tag spicadust/icloudpd-web:latest .`
4. **Git push** — `git push origin main && git push origin v<version>`.
5. **Exit summary** — print URLs (PyPI project, Docker Hub tag, GitHub tag).

## Error handling

- `set -euo pipefail` throughout.
- On any failure in `prepare`, script leaves partial state in place (bumped files, local tag) so user can fix and re-run individual steps. Never auto-rollback — rollback is git's job.
- On failure in `publish`, fail-fast. If PyPI succeeded but Docker failed, user retries just the Docker step by hand (script documents this).

## Rollback

Not automated. If user wants to abort after `prepare`:
```bash
git tag -d v<version>
git reset --hard HEAD~1   # undoes the version bump commit
rm -rf dist/
```

Documented in the script's `--help` output and in a new short section of `docs/MANUAL_TESTING.md` Gate 4.

## File structure

- `scripts/release.sh` — one file, two subcommands dispatched by `case "$1"`.
- Delete `build.sh` (stale).

## Testing

Shell scripts are not worth unit-testing. Verification is: run `scripts/release.sh prepare --dry-run` (a mode that prints every command it would run, without executing). Must be added explicitly — without `--dry-run`, prepare mutates state.
