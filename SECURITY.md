# Security

Relay is a local desktop-adjacent web app, not an internet-facing multi-user server. Keep it bound to loopback. Do not reverse-proxy it publicly without an authentication and threat-model review.

Google tokens remain in memory. Source URLs can optionally be persisted and can include credentials in query parameters; the app warns before enabling this preference. Workspace exports can include private file metadata even though they omit OAuth credentials and source URLs.

Report vulnerabilities privately through the repository owner's available GitHub contact method. Do not put access tokens, signed links, OAuth client files, or personal data in public issues. Include a minimal reproduction using non-sensitive sample values, expected behavior, and observed behavior.

Implemented defenses include source DNS pinning, private-network rejection, redirect checks, request size limits, Host/Origin validation, CSRF tokens, and a restrictive content policy. These are defense-in-depth measures and not a claim of independent security certification.
