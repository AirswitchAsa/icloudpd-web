# icloudpd-ui

## Overview

- [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) is a CLI tool for downloading iCloud photos and videos.
- `icloudpd-ui` is an application that provides a web UI wrapper around the icloudpd CLI tool.
- The application allows managing multiple icloudpd policies through the web UI and monitoring the progress of the downloads or syncs.

## Technical Details

### Architecture

- [ Next.js web ] <--Websocket--> [ Python server ] <--wrapper--> [ icloudpd Python code ]
- The `Next.js` application provides a web UI and the python server handles the icloudpd logic through a wrapper.
- The server stores policy specs in toml files and manages the states of active policies.

### Policy Management

- The server creates and updates policy specs as toml files (without passwords)
- The server loads policy specs from toml files upon server start
- All loaded and created policies are visible at the landing page
- User is required to provide the icloud password to activate a policy

## User Flow

- View all policies on landing
- Activate a policy with password or create a new one
- Configure/Start/Stop policies
- Monitor the status of a policies for download progress, sync status, etc.
- Handle 2FA when required