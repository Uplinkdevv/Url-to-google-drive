# Troubleshooting

## App will not open

Start it with `npm start`, keep the terminal running, and visit `http://127.0.0.1:3210`. Use the IP address, not `localhost`; strict Host validation is intentional. If port 3210 is occupied, stop the earlier Relay instance or set a different `PORT`.

## Google rejects sign-in

Use a **Desktop app** OAuth client, enable Google Drive API in the same project, configure the consent screen, and add your email as a test user when applicable. The app cannot complete Google's consent for you. Re-load the client JSON after restarting Relay.

## Transfer stays queued

Check that Google Drive is connected, the queue is not paused, the scheduled time has arrived, and the concurrency slots are available. A paused waiting job must be resumed separately.

## Download returns a web page

Copy the actual file's direct download link rather than the website address. Enable HTML only if you intentionally want to upload an HTML document. Relay cannot import cookies or bypass a site's sign-in.

## Source was not saved

By default, source links stay only in memory. After restart, retry asks for the original URL. You may enable source persistence in Settings; signed URLs can contain secrets and are then saved in plaintext on this computer.

## File exists but transfer failed

The last network response can be lost after Google finalizes a file. Inspect Drive before retrying to avoid an extra copy. History removal only removes local records.

## History cannot be saved

Check free disk space and write permission on the configured data directory. The app reports save errors rather than claiming the history is durable. If `state.json` is corrupt, the original is preserved; move a backup copy aside before repairing or starting a new workspace. Never upload the state file publicly without checking for saved source URLs and private metadata.
