# Validation record

## 2026-11-11 — professional workspace milestone

- `node --test`: 19 tests passed on Windows with Node.js 24.18.0.
- `node --check server.mjs` and `node --check public/app.js`: passed.
- `npm run check` and `npm run format:check`: passed for the final milestone source.
- Development dependency audit: 0 reported vulnerabilities after installing the pinned formatter.
- Real browser: overview rendered, batch dialog opened, two public example URLs queued while disconnected, both selected and paused together, overview updated, dark appearance applied.
- The browser exercised a narrow viewport with the collapsed sidebar. A full mobile/device/accessibility acceptance matrix remains outstanding.
- Simulated Google transport tests verify payload bytes, content ranges, SHA-256, MD5, empty files, HTML rejection, size rejection, and retry status probes.
- Queue tests cover priority, concurrency, connection gating, schedule gating, pause/resume, retry lifecycle, history persistence, and URL redaction.

## Not yet proven

- Real Google OAuth completion, token refresh against Google, folder creation, and actual Drive uploads.
- Every inventory item individually. The inventory intentionally labels source-backed work `implemented`, not `verified`.
- Remaining `planned` items, cross-restart byte-level resume, hosted deployment, packaged executable, and multi-account support.
- CI results until the workflow has actually run in GitHub.

Test count does not equal feature count. A passing test for one layer is not evidence for the entire product requirement.
