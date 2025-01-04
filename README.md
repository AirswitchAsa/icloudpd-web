# icloudpd-ui

## Overview

- [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) is a CLI tool for downloading iCloud photos and videos.
- `icloudpd-ui` is an application that provides a web UI wrapper around the icloudpd Python library.
- The application allows managing multiple icloudpd settings ("policies" in `icloupd-ui`) through the web UI and monitoring the progress of the downloads.

## Technical Details

### Architecture

- [ Next.js web ] <--Websocket--> [ Python server ] <--wrapper--> [ icloudpd Python code ]
- The `Next.js` application provides a web UI and the python server handles the logic and interaction with icloudpd.
- The user can manage the policy states on the web UI.
- The server stores policy specs in toml files at designated path as well upon changes.

### Policy Management

- The server loads policy specs from toml files upon server start (TBC: accept uploaded toml files)
- All loaded and created policies are visible at the landing page
- User is required to provide the icloud password to authenticate the policy before downloading

## User Flow

- View all policies on landing
- Authenticate a policy with password or create a new one
- Handle 2FA when required
- Create/Configure/Delete/Start/Stop policies
- Monitor the status of a policies for download progress through logs
