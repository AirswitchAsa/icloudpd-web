#!/usr/bin/env bash
# Local release flow for icloudpd-web. Two subcommands:
#   prepare  — run gates, bump version, build artifacts locally, tag locally
#   publish  — push tag, upload to PyPI, build+push Docker image
#
# See docs/superpowers/specs/2026-04-20-release-script-design.md for rationale.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DOCKER_IMAGE="spicadust/icloudpd-web"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m==>\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[1;31m==>\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<EOF
Usage:
  scripts/release.sh prepare [--dry-run] [--version X.Y.Z]
  scripts/release.sh publish

prepare:
  Runs gates, bumps version in pyproject.toml / __init__.py / web/package.json,
  builds the frontend and Python wheel+sdist, creates a local git tag.
  Does NOT push or publish anything.

  --dry-run        print every mutating command without executing it
  --version X.Y.Z  override auto-computed CalVer version

publish:
  Reads version from pyproject.toml, verifies matching local tag and dist/
  artifacts, then: uv publish, docker buildx build --push (multi-arch),
  git push main + tag.

  Requires UV_PUBLISH_TOKEN in env and prior 'docker login'.

Abort a prepared release before publishing:
  git tag -d v<version>
  git reset --hard HEAD~1
  rm -rf dist/
EOF
}

# ---------- shared helpers ----------

read_pyproject_version() {
    grep -E '^version = "' pyproject.toml | head -1 | sed -E 's/^version = "(.*)"/\1/'
}

sed_inplace() {
    # Portable in-place sed. macOS BSD sed requires '' after -i; GNU sed doesn't.
    if sed --version >/dev/null 2>&1; then
        sed -i "$@"
    else
        sed -i '' "$@"
    fi
}

bump_package_json() {
    # Avoid sed on JSON — use node which is already a frontend dep.
    local ver="$1"
    node -e '
        const fs = require("fs");
        const p = "web/package.json";
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        j.version = process.argv[1];
        fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    ' "$ver"
}

compute_calver() {
    # YYYY.M.D with no zero padding — matches prior releases (2026.3.1, 2026.4.19).
    local y m d
    y=$(date +%Y)
    m=$(date +%-m 2>/dev/null || date +%m | sed 's/^0*//')
    d=$(date +%-d 2>/dev/null || date +%d | sed 's/^0*//')
    printf '%s.%s.%s' "$y" "$m" "$d"
}

auto_bump_if_taken() {
    # If origin already has v<base>, try v<base>.post1, .post2, ...
    local base="$1"
    local candidate="$base"
    local n=0
    local tags
    tags=$(git ls-remote --tags origin 2>/dev/null | awk '{print $2}' | sed 's|refs/tags/||' || true)
    while printf '%s\n' "$tags" | grep -qx "v$candidate"; do
        n=$((n + 1))
        candidate="${base}.post${n}"
    done
    printf '%s' "$candidate"
}

# ---------- prepare ----------

cmd_prepare() {
    local dry_run=0
    local explicit_version=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)  dry_run=1; shift ;;
            --version)  explicit_version="$2"; shift 2 ;;
            -h|--help)  usage; exit 0 ;;
            *)          die "unknown flag: $1" ;;
        esac
    done

    run() {
        if [[ $dry_run -eq 1 ]]; then
            printf '  [dry-run] %s\n' "$*"
        else
            "$@"
        fi
    }

    log "Preflight"
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD)
    [[ "$branch" == "main" ]] || die "must be on main, currently on $branch"

    if ! git diff --quiet || ! git diff --cached --quiet; then
        warn "working tree is dirty — continuing, but commit cleanup is your problem"
    fi

    if compgen -G "dist/*" >/dev/null; then
        die "dist/ not empty — remove stale artifacts before preparing a new release"
    fi

    log "Resolving version"
    local version
    if [[ -n "$explicit_version" ]]; then
        version="$explicit_version"
    else
        local base
        base=$(compute_calver)
        version=$(auto_bump_if_taken "$base")
        if [[ "$version" != "$base" ]]; then
            warn "v$base already on origin — using $version (post-release)"
        fi
    fi
    log "Version: $version"

    if git rev-parse "v$version" >/dev/null 2>&1; then
        die "local tag v$version already exists"
    fi

    log "Gate: make test"
    run make test

    log "Gate: make check-upstream"
    run make check-upstream

    log "Manual gate reminder"
    cat <<EOF
  If this release touches runner / config_builder / MFA / subprocess code,
  run these from docs/MANUAL_TESTING.md before publishing:
    - Gate 2: ICLOUDPD_REAL_TEST=1 uv run pytest tests/runner/test_real_icloudpd_syntax.py
    - Gate 3: manual live smoke against a throwaway iCloud account
EOF

    log "Bumping version files"
    run sed_inplace -E "s/^version = \".*\"/version = \"$version\"/" pyproject.toml
    run sed_inplace -E "s/^__version__ = \".*\"/__version__ = \"$version\"/" src/icloudpd_web/__init__.py
    run bump_package_json "$version"

    log "Committing version bump"
    run git add pyproject.toml src/icloudpd_web/__init__.py web/package.json
    run git commit -m "Release v$version"

    log "Building frontend"
    run make build-web

    log "Building Python wheel + sdist"
    run uv build

    log "Tagging locally"
    run git tag "v$version"

    log "Prepare complete"
    cat <<EOF

  Version:   $version
  Tag:       v$version (local only — not pushed)
  Artifacts: $(ls dist/ 2>/dev/null | sed 's/^/             /' || echo '             (dry-run)')

  Next:
    - Inspect dist/ and the version-bump commit
    - Run: scripts/release.sh publish

  To abort:
    git tag -d v$version
    git reset --hard HEAD~1
    rm -rf dist/
EOF
}

# ---------- publish ----------

cmd_publish() {
    [[ $# -eq 0 ]] || { usage; exit 1; }

    log "Preflight"
    local version
    version=$(read_pyproject_version)
    [[ -n "$version" ]] || die "could not read version from pyproject.toml"
    log "Version: $version"

    git rev-parse "v$version" >/dev/null 2>&1 \
        || die "local tag v$version not found — did you run 'prepare'?"

    ls "dist/icloudpd_web-$version"*.whl >/dev/null 2>&1 \
        || die "no wheel for $version in dist/"
    ls "dist/icloudpd_web-$version"*.tar.gz >/dev/null 2>&1 \
        || die "no sdist for $version in dist/"

    [[ -n "${UV_PUBLISH_TOKEN:-}" ]] \
        || die "UV_PUBLISH_TOKEN not set — export your PyPI token first"

    docker info >/dev/null 2>&1 \
        || die "docker daemon unreachable"

    log "Publishing to PyPI"
    uv publish

    log "Building + pushing multi-arch Docker image"
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        --build-arg "VERSION=$version" \
        --tag "$DOCKER_IMAGE:$version" \
        --tag "$DOCKER_IMAGE:latest" \
        --push \
        .

    log "Pushing git"
    git push origin main
    git push origin "v$version"

    log "Publish complete"
    cat <<EOF

  PyPI:       https://pypi.org/project/icloudpd-web/$version/
  Docker Hub: https://hub.docker.com/r/${DOCKER_IMAGE}/tags?name=$version
  Git tag:    v$version
EOF
}

# ---------- dispatch ----------

[[ $# -gt 0 ]] || { usage; exit 1; }
subcmd="$1"; shift || true
case "$subcmd" in
    prepare)  cmd_prepare "$@" ;;
    publish)  cmd_publish "$@" ;;
    -h|--help|help) usage ;;
    *)        usage; exit 1 ;;
esac
