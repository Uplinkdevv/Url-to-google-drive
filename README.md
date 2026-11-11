# Relay — URL to Google Drive

A local transfer workspace by Uplinkdev. Queue public download URLs, organize files, and stream them to Google Drive without storing complete copies on disk.

> **Development status:** The professional workspace is implemented. The requested 300+ capability expansion is still underway. [Feature inventory](docs/FEATURES.md) distinguishes implemented functionality from planned work; it does not claim 300+ verified features. Live Google authorization and an actual Drive upload still require user credentials and consent.

## Start

Requires **Node.js 22 or later**. No third-party runtime packages are needed.

```sh
npm start
```

Open **http://127.0.0.1:3210**. On Windows, double-click `start.cmd` to start the app and open your browser. Keep the app running and your computer awake during transfers.

## Current workspace

- Overview with live queue counts, transferred bytes, and combined speed.
- Single URLs and batch intake from text, CSV, or JSON; up to 500 links per batch.
- Priority queue, configurable concurrency, one-time schedules, pause waiting jobs, cancel, retry, and bulk actions.
- Tags, notes, pinning, archives, search, filtering, sorting, pagination, and CSV/JSON export.
- Templates for naming patterns, tags, and priority.
- Light, dark, and system themes; compact density; keyboard shortcuts.
- Streaming upload chunks, exponential retry backoff, recovery probes, size limits, and bandwidth throttling between chunks.
- SHA-256 integrity checks before finalization and MD5 comparison when Google supplies a checksum.
- Saved history, preferences, activity, and templates; atomic writes and explicit interrupted-job recovery.

The source contains additional implemented controls; see the inventory for their acceptance status. A feature's presence in code does not replace a live service test.

## Connect Google Drive

1. Create/select a project at [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API**.
3. Configure Google Auth Platform **Branding** and **Audience**. If the external app is in testing, add your own Google email as a test user.
4. Create an OAuth client with application type **Desktop app**, then download its JSON.
5. Open **Help & setup** in Relay, choose the JSON, and click **Connect Google Drive**.

Relay requests only the `drive.file` scope. It can create files and folders and access items created through the app. Choose **My Drive** or create an app-owned folder, including nested folders. Browsing arbitrary existing folders is not supported.

Google client details and tokens remain in memory. After restarting, load your client JSON and sign in again. Disconnect clears local tokens; revoke the grant in your Google account if you want to remove Google's authorization too.

## Imports

Text: one HTTP/HTTPS file URL per line; blank lines and lines beginning with `#` are ignored.

```csv
url,name,priority,tags
https://example.com/report.pdf,Quarterly report.pdf,1,research;work
```

```json
[
  { "url": "https://example.com/archive.zip", "tags": ["backup"], "priority": 0 },
  { "url": "https://example.com/report.pdf", "scheduledAt": "2026-12-01T09:00:00Z" }
]
```

Priority is `-1` (low), `0` (normal), or `1` (high). CSV tags use semicolons. JSON tags use arrays. Naming patterns accept `{name}`, `{base}`, `{ext}`, `{host}`, `{date}`, and `{time}`. Date/time filename tokens use UTC; the schedule picker uses your computer's local time.

## Storage and privacy

- Data is stored in `.relay/state.json`, excluded from Git. Do not publish this directory.
- Original URLs are **not saved by default**. Enable **Save source URLs** if you need queued jobs and retry links after restart. Signed links may contain secrets; enabling this setting stores them in plaintext locally.
- Public exports omit source URLs and OAuth credentials, but can contain file names, notes, tags, and Drive links. Review exports before sharing.
- Incomplete active transfers are marked **Interrupted** after restart. Retrying starts over; cross-restart byte-level resume is not implemented.
- Source requests block private networks, pin DNS resolution, and validate redirect destinations. The local server checks Host, Origin, and a session anti-forgery token.
- History removal does not delete files from Google Drive. Cancellation may race with successful Google finalization; check Drive before retrying if a response was lost.

## Limits

This is a **local relay**, not a hosted cloud-to-cloud service. Downloads must be public direct file links. Private sites, interactive download buttons, streaming-service pages, and cookie-based authentication are not supported. HTML pages are rejected unless explicitly allowed.

Schedules only run while Relay is open, connected, and dispatch is enabled. Pausing the queue stops new jobs; it does not pause active streams. Per-file pause is currently limited to waiting jobs. Source URLs can expire. Google storage quota still applies.

## Development

```sh
npm test
npm run check
npm run features
```

`PORT` changes the listen port. `RELAY_DATA_DIR` changes the local data directory. The app always binds to `127.0.0.1`. Tests use temporary isolated workspaces and simulated Google responses; they never upload user files.

- [Feature inventory](docs/FEATURES.md)
- [Validation notes](docs/VALIDATION.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

The repository's original **CC0 1.0 Universal** license is preserved in [LICENSE](LICENSE).

Protocol references: [Google resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads) · [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).
