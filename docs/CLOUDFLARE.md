# Free Cloudflare deployment (draft, not yet live-tested)

Frontend: https://sparkles-systems-solutions.github.io/Advance-Meeter-Taxi-slzzz-com/

API: https://odd-sun-eecf.dilshan7878787.workers.dev

Existing Worker: `odd-sun-eecf`. Existing D1 database: `taxi-db`, binding name `DB`.
The Node backend in `server/` is an alternative; do not paste it into Workers.

## Dashboard steps

1. Open `taxi-db` from the Worker Bindings table, then its **Console**. Paste all of `cloudflare/schema.sql` and execute it. If the console requires individual statements, execute complete CREATE statements in order; each trigger block must stay intact. The schema is safe to rerun and does not drop existing tables/data. This is a new D1 schema, not an automatic Node database migration.
2. Worker **Settings → Runtime → Compatibility flags**: enable `nodejs_compat` if the compatibility date is earlier than 2026-08-04. The Worker uses only `node:crypto`; no filesystem or Node HTTP server is required. A compatibility date of 2025-04-08 or later supports the crypto APIs used here.
3. **Settings → Variables and Secrets → Add**: type **Secret**, name `SETUP_TOKEN`. Generate a random secret of at least 32 characters using your password manager and save it temporarily. Do not put it in GitHub, chat, a screenshot, or this document. Save/deploy the setting.
4. **Edit code**: replace the complete Hello World module with `cloudflare/worker.mjs`. Save and deploy. Preserve the `DB` binding.
5. Visit `/api/health`. Expect `{"ok":true,"service":"taxi-api","storage":"D1"}`. A 503 means the binding/schema/runtime needs checking; do not publish the frontend yet.
6. Visit `/setup` on the Worker URL. Enter the setup secret and choose a username. Submit once. Save the generated **login key** in your password manager before closing the success page. It is shown once and never recoverable from the database. Do not send this page in a screenshot. Setup closes automatically after the first account exists.
7. Delete the `SETUP_TOKEN` secret in Worker Settings and redeploy. This does not change the saved account.
8. Keep PR #1 as a draft until deployed API smoke checks and staging frontend acceptance pass. `assets/config.js` already contains the Worker URL, no secret. Publishing the branch frontend requires GitHub Pages configuration or a reviewable staging deployment; it has not been done here.

## Login keys and account administration

This free-tier backend uses server-generated 256-bit random login keys in place of human-chosen passwords. Sign in with the username and key. The existing API JSON field `password` carries that key for frontend compatibility. D1's `users.password` column contains only its SHA-256 hash. Human-chosen passwords must not be substituted: a fast hash is appropriate for unguessable random keys, not memorable passwords.

This avoids deliberately expensive password KDF work on the Free plan's 10 ms CPU budget without weakening a password KDF. The Node alternative still uses scrypt passwords. Loss of a login key requires rotation by another administrator. If the sole administrator loses their key, recovery requires authenticated Cloudflare database administration; do not reopen public setup or delete users to recover access.

Administrator API endpoints (Bearer session required; an account-management UI is not included):

- `POST /api/admin/users` with `{ "username": "driver01", "role": "driver" }`: returns a one-time `accessKey` for the new account. State is created atomically by a D1 trigger.
- `POST /api/admin/users/:id/password`: rotates the login key and returns the new `accessKey`. The legacy path name is retained; no chosen password is accepted. Sessions and tracking shares are revoked atomically.
- `POST /api/admin/users/:id/disable`: disables the account and revokes its sessions/shares. An administrator cannot disable themselves.

Do not log request bodies, Authorization headers, setup form contents, or responses that return keys.

## Data and free-tier boundaries

- Exact allowed browser origin is `https://sparkles-systems-solutions.github.io` (origins do not include a repository path). CORS is not an authorization mechanism; every private route also checks a session and owner.
- State updates use a version predicate. D1 triggers make the accepted update, recovery snapshot, and audit event atomic. Three snapshots per account are retained. Audit records remain until an operator performs a retention review.
- State request and stored serialized-state limit: 750,000 bytes, leaving headroom below D1's 2,000,000-byte row limit. This includes all an account's rides, expenses, and backups. This is a small deployment, not an unlimited fleet database. A larger dataset needs normalized tables/pagination; immutable history cannot simply be deleted to gain space. At the limit, writes fail visibly and the user must export unsaved records.
- Free quotas are shared by the Cloudflare account: Workers 100,000 requests/day; D1 5 million rows read/day, 100,000 rows written/day, maximum 500 MB per database and 5 GB across the account. Index and trigger work also consumes quotas. Inspect actual usage before adding users or raising save/tracking frequency.
- Login throttling is database-backed by Cloudflare-provided client IP and normalized username. It persists between Worker instances. Expired throttle rows are cleaned on successful login; a sustained attack can consume quotas and needs operational intervention.
- Session keys remain in browser memory and expire after 12 hours. Tracking is opt-in, revocable, and expires after six hours (completed trips at most 15 more minutes). This is payment recording, not payment-provider settlement.
- Export old browser data before changing the live site. The Node legacy-import CLI cannot run against D1. Cloudflare historical import is not implemented in this draft; keep old backups until a reviewed import path is ready.
- External frontend CDNs and inline event handlers remain. A strict frontend CSP and dependency vendoring are still outstanding. Moving from one HTML file to several files does not itself secure an app.

## Verification completed / remaining

`node --test test/*.test.mjs`: 43 passing reported tests, including three parent tests (40 individual checks). The new Worker suite calls the real Worker handler with Web Request/Response objects and a D1-shaped adapter executing actual SQLite SQL/triggers. It covers setup closure, key hashing, login, exact CORS, user isolation, tariff validation, stale/concurrent writes, transaction rollback, size limits, public tracking privacy, rate limiting, key rotation, disabling and logout. The pre-existing frontend simulated-DOM/API and Node security suites also pass.

This is not a deployed Cloudflare or workerd runtime test. Worker CPU usage at representative data sizes, actual D1 behavior/quotas, mobile layout, GPS routes/backgrounding, payment reconnect, and printing still need staging tests before live use. Local execution time must not be treated as Cloudflare CPU evidence. No Cloudflare account mutations or live user transactions were made by the assistant.

Official references (checked 2026-09-11):
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
