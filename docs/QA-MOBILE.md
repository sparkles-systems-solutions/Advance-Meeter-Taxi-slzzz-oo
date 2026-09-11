# Mobile frontend and function-parity QA — 2026-09-11

Reference: user attachment `index-fixed (1).html`. Compared with the deployed frontend at draft-branch commit `308c84c0145ee3608b32e5c5668168f2b09fc22b` and the changes in this update.

## Outcome

All 160 named JavaScript functions from the reference HTML remain in the modular app. This is a source inventory, **not** proof that every feature behaves identically or works in a real browser. No original meter, booking, report, fuel, repair, voice, navigation or receipt feature was intentionally removed in this UI update.

The user-requested account name/sign-out, sync status, Retry save, Export unsaved data, sharing checkbox and View/share link now live under Settings → Account & cloud sync. Normal successful saves no longer take space above the meter. Unsaved, saving and error states remain visible in a compact main-page notice pointing to Settings so cloud save failures cannot silently disappear inside a closed modal.

## Corrections implemented

- Moved account/sync/sharing controls into a wrapping Settings panel with 44px minimum button targets. The login fields use 16px text; login overlay can scroll on short screens.
- Default HTML now shows the account gate and hides the driver console until authentication, rather than briefly showing driver controls before JavaScript login initialization. Public tracking explicitly hides the account gate.
- Settings validation mirrors the server's name/rate limits. Save waits for cloud confirmation, keeps the editor open on failure, and prevents double submissions.
- The paid receipt and removal of its pending-payment record now enter the same versioned state save. Previously those were separate writes, allowing a completed payment to reappear as pending after a refresh between writes.
- An explicitly enabled tracking share/token is retained when restoring an active ride. Revoking a share updates saved ride state. Opening the sharing popup from Settings closes Settings to avoid modal overlap.
- Passenger tracking now displays the actual ride mode instead of retaining the default Auto label.
- Removed misleading visible local-PIN instructions and clarified the limitations of legacy backup restore and server snapshot access.
- Frontend asset URLs have a version suffix to reduce mixed cached JS/CSS after deployment.

## Features whose behavior still differs from the original HTML

| Area | Current cloud behavior |
|---|---|
| Authentication | Account username/login key replaces the browser's local settings PIN. Driver users cannot change tariffs. |
| Stored records | Per-account server state replaces localStorage. Old browser records are not automatically imported. |
| Legacy JSON restore | Browser replacement is blocked. Cloudflare historical import is not implemented; retain old backups. This is an outstanding feature gap, not a passed parity check. |
| Rolling recovery history | Cloud snapshots exist but have no browser restore/list API. Manual JSON export and optional download after payment remain. |
| Live tracking | Opt-in expiring/revocable links replace the ntfy relay. Public addresses/contact details are intentionally withheld. |
| Offline/reload | Unsaved working data is memory-only. Export before leaving; offline-safe persistence is not implemented. |
| Accounts | This update does not rotate the user's login key or change the deployed Worker. |

## Automated checks

Run:

```sh
node --test test/frontend.test.mjs test/security.test.mjs test/mobile-layout.test.mjs
```

The report contains **43 passing tests: 41 individual checks plus two parent tests**. Coverage includes:

- Real local HTTP/SQLite server with the actual app and session adapter in a simulated DOM: login, settings success/failure/validation, five mode switches, Settings menu entry points, fuel and repair saves, booking create/delete, manual trip, tracking create/restore/revoke, payment and pending cleanup, bank details, night fare, subsequent saves and stale-write rejection.
- Server authentication, account isolation, tariff enforcement, receipt immutability, tracking ownership/privacy/expiry/revocation, logout, private-path exclusion and snapshots/audit.
- Static structural checks: all 160 reference function names, controls placed inside Settings, initial authentication gating, unique IDs, wait options 0–120, inline handler JavaScript syntax, and mobile CSS requirements.

No production transactions or user credentials were used. The locally prepared but unshipped key-rotation Worker changes are **not** part of this frontend release or its claimed test count.

## Remaining acceptance work

Actual Android Chrome/iOS Safari rendering at phone widths and landscape, device keyboard, GPS permission/route accuracy/backgrounding, real browser tracking, CDN outages, voice recognition, map search, PDF/print and reconnect behavior have not been validated in this run. Source/DOM checks are not visual browser QA. The paid receipt format must be checked on the intended printer before live billing.

Recommendation: keep one responsive web app and complete this acceptance pass before considering an installable PWA/native wrapper. No native app, service-worker offline guarantee or app-store package is included here. Preserve existing browser backups; do not clear site data to troubleshoot styling.
