# icloudpd-web

## Release

- [Python Package](https://pypi.org/project/icloudpd-web/)
- [Docker Image](https://hub.docker.com/r/spicadust/icloudpd-web)

## Overview

- **Warning**: This is a personal project under active development. You can contribute to the project by submitting a feature request or a bug report via Github issues.
- [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) is a CLI tool for downloading iCloud photos and videos.
- `icloudpd-web` is an application that provides a web UI wrapper around the icloudpd Python library.
- The application allows managing multiple icloudpd settings ("policies" in `icloupd-web`) through the web UI and monitoring the progress of the downloads.
- The application bundles a static next.js application in a fastapi server. Therefore, you can spin up the server and use the web UI using the python distribution.

## Screenshots

<img width="1509" alt="main" src="https://github.com/user-attachments/assets/2faec712-01bd-4eff-bdff-cdbdfd8ee728" />
<img width="1509" alt="edit" src="https://github.com/user-attachments/assets/d613ddd8-5d5f-4209-8bbe-0586d7fd500f" />

## Installation

The application is available on pypi and requires python 3.12 or later.

### Usage

```bash
pip install icloudpd-web
icloudpd-web
```

run `icloudpd-web --help` to see the available options.

## User Flow

- Log in with server password, reset it or continue as a guest.
- View all loaded policies on landing. These policies are from the toml files provided when starting up the server.
- Authenticate a policy with password or create a new one.
- Handle 2FA when required.
- Work with policies that are ready.
- Monitor the status of a policies for download progress through logs.

### Details

- The user can add, edit, duplicate, delete, start and stop a policy.
- Download progress of a policy can be viewed through the logs that can be downloaded when policy is not running.
- On the Web UI, the user can upload a toml file to replace the currently loaded policies or download the currently loaded policies as a toml file.
- The user can update the server settings or reset the server password through the settings page.
- Refer to the [example_policy/example.toml](example_policy/example.toml) for the policy format.
- Refer to the [icloudpd docs](https://icloud-photos-downloader.github.io/icloud_photos_downloader/) for the policy options. Note that even though this app is built on top of icloudpd, the policy options are not exactly the same. More detailed documentation on this will be provided in the future.

## Technical Details

### Architecture

- [ Next.js web ] <--Websocket--> [ FastAPI server ] <--wrapper--> [ icloudpd Python code ]
- The next.js application provides a web UI and the python server handles the logic and interaction with icloudpd.
- The user can manage the policy states on the web UI.
- The server stores policy specs in toml files at designated path as well upon changes.

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
