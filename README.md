# icloudpd-web

## Overview

- [icloud-photos-downloader](https://github.com/icloud-photos-downloader/icloud_photos_downloader) is a CLI tool for downloading iCloud photos and videos.
- `icloudpd-web` is an application that provides a web UI wrapper around the icloudpd Python library.
- The application allows managing multiple icloudpd settings ("policies" in `icloupd-web`) through the web UI and monitoring the progress of the downloads.

## Technical Details

### Architecture

- [ Next.js web ] <--Websocket--> [ FastAPI server ] <--wrapper--> [ icloudpd Python code ]
- The `Next.js` application provides a web UI and the python server handles the logic and interaction with icloudpd.
- The user can manage the policy states on the web UI.
- The server stores policy specs in toml files at designated path as well upon changes.

### Policy Management

- The server loads policy specs from toml files upon server start if provided
- All loaded and created policies are visible at the landing page
- User is required to provide the icloud password to authenticate the policy before downloading

## User Flow

- View all policies on landing
- Authenticate a policy with password or create a new one
- Handle 2FA when required
- Create/Edit/Duplicate/Delete/Start/Stop policies
- Monitor the status of a policies for download progress through logs

## Term of Use
The copyright of icloudpd-web ("the software") fully belongs to the author(s). There will be a hosted version created by the author(s) for public access. The software is free to use for personal, educational, or non-commercial purposes only. Unauthorized use to generate revenue is not allowed.
