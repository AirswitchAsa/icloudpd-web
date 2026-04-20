# icloudpd-web

## Release

- [Python Package](https://pypi.org/project/icloudpd-web/)
- [Docker Image](https://hub.docker.com/r/spicadust/icloudpd-web)

## Overview

- **Warning**: This is a public software from personal project that comes without any warranties. You may use it for personal usages at your own risk. You can contribute to the project by submitting a feature request or a bug report via Github issues.
- [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) is a CLI tool for downloading iCloud photos and videos.
- `icloudpd-web` is an application that provides a web UI wrapper around the icloudpd Python library.
- The application allows managing multiple icloudpd settings ("policies" in `icloudpd-web`) through the web UI and monitoring the progress of the downloads.
- The application bundles a static next.js application in a fastapi server. Therefore, you can spin up the server and use the web UI using the python distribution.

## Screenshots

<img width="1509" alt="main" src="https://github.com/user-attachments/assets/2faec712-01bd-4eff-bdff-cdbdfd8ee728" />
<img width="1509" alt="edit" src="https://github.com/user-attachments/assets/d613ddd8-5d5f-4209-8bbe-0586d7fd500f" />

## Installation

Requires Python 3.12+.

```bash
pipx install icloudpd-web
```

## Development

Backend (Python, uv):

```bash
uv sync --dev
make dev-backend    # http://127.0.0.1:8000
```

Frontend (Vite, in another terminal):

```bash
make install-web
make dev-web        # http://127.0.0.1:5173 with proxy to :8000
```

Production build:

```bash
make build          # builds web into src/icloudpd_web/web_dist and uv-builds the wheel
```

Once built, `icloudpd-web` hosts both API and UI on a single port.

## First run

Generate a password hash, set the session secret, and start the server:

```bash
export ICLOUDPD_WEB_PASSWORD_HASH=$(icloudpd-web init-password yourpassword)
export ICLOUDPD_WEB_SESSION_SECRET=$(openssl rand -hex 32)
icloudpd-web --host 0.0.0.0 --port 8080
```

Data lives in `~/.icloudpd-web/` by default (override with `--data-dir`).

## Usage

run `icloudpd-web --help` to see the available options.

## User Flow

- Log in with the server password (set via `ICLOUDPD_WEB_PASSWORD_HASH`).
- View all policies on landing. Policies are TOML files in `~/.icloudpd-web/policies/`.
- Create, edit, duplicate, or delete policies through the REST API.
- Authenticate a policy with iCloud credentials; handle 2FA when required.
- Start or stop a policy run; stream live logs and progress via SSE.
- Monitor run history; log files are stored at `~/.icloudpd-web/runs/{policy}/{run_id}.log`.

### Details

- The user can add, edit, duplicate, delete, start and stop a policy.
- Download progress of a policy can be viewed through the SSE log stream or the stored log files.
- Refer to the [example_policy/example.toml](example_policy/example.toml) for the policy format.
- Refer to the [icloudpd docs](https://icloud-photos-downloader.github.io/icloud_photos_downloader/) for the underlying CLI options.

## Technical Details

### Architecture

- **Backend:** FastAPI (Python 3.12). REST for mutations + SSE for log/progress streaming.
- **icloudpd integration:** icloudpd is run as a subprocess (not imported). One subprocess per run; logs captured to `~/.icloudpd-web/runs/{policy}/{run_id}.log`.
- **Policies:** one TOML file per policy at `~/.icloudpd-web/policies/*.toml`, atomic writes.
- **Scheduler:** 1 Hz asyncio tick. Cron expressions per policy; overlapping fires are skipped.
- **Auth:** single-user server password (scrypt-hashed, set via env var); cookie session.
- **Secrets:** iCloud passwords in `~/.icloudpd-web/secrets/*.password` (file mode 0600, never returned to clients).
- **2FA:** handled via icloudpd's MFA provider mechanism plus a local file-backed callback.
- **Integrations:** Apprise (server-wide notifications) and `aws s3 sync` (per-policy).

## Term of Use

The copyright of icloudpd-web ("the software") fully belongs to the author(s). The software is free to use for personal, educational, or non-commercial purposes only. Unauthorized use to generate revenue is not allowed.

## License

This project is licensed under CC BY-NC-4.0. This means:

You can:

- Use this package for personal projects
- Modify and distribute the code
- Use it for academic or research purposes

You cannot:

- Use this package for commercial purposes
- Sell the code or any modifications
- Include it in commercial products

For full license details, see the [LICENSE](LICENSE) file.
