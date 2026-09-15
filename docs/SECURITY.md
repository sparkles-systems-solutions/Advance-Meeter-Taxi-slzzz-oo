# Backend variants

The Cloudflare variant uses generated 256-bit login keys (SHA-256 hashes), three D1 snapshots, and a 750,000-byte state limit. See [CLOUDFLARE.md](CLOUDFLARE.md) for its setup and remaining release gates. Password/scrypt, filesystem administration and five-snapshot descriptions below apply to the Node variant. Neither variant has completed deployed mobile acceptance testing.

# Security review

## Controls implemented

- Server-side authentication with per-password random salt and scrypt; no bundled credentials.
- Random 256-bit bearer session tokens; only token hashes stored in the database; 12-hour expiry; logout/reset/disable invalidation.
- Exact origin CORS allowlist, no cookie authentication, and account ownership derived from the server session.
- Prepared SQLite statements, bounded request size, data validation, atomic writes, version conflicts, per-account snapshots and independent server audit events.
- New fare validation against the account's server tariff; immutable paid receipts. Manual distance, manual fare and GPS remain driver-provided business inputs, not proof of a real-world journey.
- Sign-in attempt limiting (20 attempts/15 minutes per socket IP). With the same-machine reverse proxy this is a shared limit, conservatively throttling all clients. Multi-instance/distributed abuse protection must be provided at the proxy before scaling.
- Tracking off until the driver opts in. Six-hour maximum share lifetime; completion reduces expiry to 15 minutes; explicit revoke and creation of a new link invalidate old shares for that driver.
- Tracking response excludes customer phone, delivery contact and pickup/drop addresses. Anyone holding the link can still view its live coordinates during its lifetime.
- Database paths and backend source excluded by the backend's static allowlist. No session or account data in browser localStorage.

## Deployment responsibilities and remaining limits

This is a reviewable implementation, not a claim that the application is unhackable or production-certified. Do not publish secrets in the public repository.

- HTTPS and a persistent backend are required. GitHub Pages alone cannot execute the API.
- The database and administrative exports are not encrypted by this code. Use protected filesystem permissions, encrypted volumes/backups, and an unprivileged OS service account.
- Sessions are in memory in the browser. Reload requires sign-in. Unsaved state can be lost if the browser/phone terminates before a successful sync; the app exposes save status and recovery export, but cannot guarantee offline persistence.
- The frontend still uses the existing CDN libraries (Tailwind runtime, Leaflet, Chart.js, jsPDF, QRCode and html2canvas), third-party fonts and map/geocoding services. These are trusted dependencies. A follow-up production build should vendor and pin these assets with reviewed hashes and remove inline event handlers before enforcing a strict script CSP. File separation alone does not solve script injection or dependency compromise.
- Browser GPS and manually entered fare/distance can be falsified by the driver. Server checks arithmetic and authorization, not real-world GPS authenticity or payment settlement. Recording a cash/card payment does not charge a card.
- Public tracking reads expose only a small payload but still need proxy-level request limits at public scale. Expired links are denied immediately; expired rows are cleaned when a new share is created.
- The backend stores account state as versioned JSON for compatibility with the original app. It has a 2 MiB request limit and is intended for a small deployment. Larger fleets need normalized records, paginated APIs and incremental synchronization.
- There is no email password reset, MFA, centralized fleet administration, card gateway, or background native mobile service in this change.

## Validation performed

Real local HTTP API tests verify unauthenticated access denial, password rejection/hash storage, account isolation, origin enforcement, tariff restrictions, tampered fares, receipt immutability, version conflicts, tracking ownership/privacy/expiry/revocation, logout, private-file exclusion and snapshot/audit creation.

The real frontend application code and session adapter are exercised with a simulated DOM against the real local HTTP API for login, manual ride start/end, payment persistence, subsequent saves and concurrency handling. This is not a browser rendering test. No new live production transactions were created.

Previous mobile/regression fixes were carried into this branch. Actual mobile rendering, measured-route GPS, third-party CDN loading, HTTPS deployment and printing must still be verified on the deployed staging version.
