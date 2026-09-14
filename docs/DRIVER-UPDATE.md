# Driver integration test release

This branch is an integration candidate. Do not switch the live Pages deployment until its Worker is updated and the checklist below passes. No existing login key is changed by deploying these files. Reset-key actions require an explicit admin click.

## Implemented behavior

| Area | Behavior |
| --- | --- |
| Auto | GPS pickup and final location; traveled samples determine metered km |
| GPS | Current GPS pickup, searchable/map-selected destination; traveled samples determine km |
| Manual | Select pickup/drop, enter km and optionally agreed fare; GPS only updates passenger location |
| Delivery | Manual distance behavior and existing delivery/pickup details |
| Book/Sch | Existing scheduler/calendar, loaded booking uses its entered km and agreed fare |
| Billing | All five modes: waiting, discount and night apply, including agreed fares |
| Rates | Every authenticated driver changes their own bounded rates; old receipts remain immutable |
| Reports | Settings → Reports, CRM & driver accounts; admin can inspect each driver's receipts and CRM |
| Accounts | Admin lists/creates/enables/disables drivers and can explicitly reset a key |
| CRM | Optional customer name/phone, ride count, total fare, last ride and history; anonymous receipts still visible |
| Passenger | Start opens QR/link; exact bearer share, coordinates only; completion cannot revert to active |
| GPS startup | No repeating full-screen loading loop; poor signal shows status and offers refresh |
| Native | Android location foreground service; iOS CLLocationManager background updates; native meter is authoritative while installed |

Billing order preserves the original calculation order, adding night to agreed fares:
`round(max(0, (distanceFareOrAgreedFare + waitingMinutes * waitingRate - discount) * nightMultiplier))`.
Night multiplier is `1 + nightPercent/100` when night is on, otherwise 1.
Manually entered km are not silently replaced with GPS distance in Manual/Delivery/loaded bookings.

## Native build and distribution

The native wrappers load the same HTTPS application, preserving existing HTML/JS functions rather than maintaining a second, divergent taxi UI. Native bridge messages are restricted to the trusted top-level app origin/path. Tokens remain in memory; persisted native state contains ride identity, distance and coordinates, not credentials. A device restart/process termination requires opening the app and signing in/restoring the ride; the code does not pretend to recover distance traveled without samples.

Android: use JDK 17, Android SDK 35 and Gradle 8.11.1. Run `gradle -p native/android assembleDebug`. The GitHub workflow `Driver integration QA` builds and attaches a debug APK. Debug builds are for testing; use a stable, privately held release signing key for ongoing manual distribution so updates retain app identity. Do not put signing keys in this repository.

iPhone: on a Mac install Xcode and XcodeGen, run `cd native/ios && xcodegen generate`, open `TaxiDriver.xcodeproj`, select your signing team and connected phone. The workflow checks compilation without signing. It does not produce an installable signed IPA. Ad hoc distribution requires Apple signing/provisioning and registered devices; an Android APK cannot be installed on iPhone. App-store publication is not required for registered-device distribution, but it is not unrestricted free distribution.

Test native builds load `/Advance-Meeter-Taxi-slzzz-oo/driver-test/`; the existing live root remains unchanged. They require this branch's `assets/native-meter.js`, updated app.js and updated Worker to be deployed. A compiled wrapper pointing at an older page will not enable native metering. Do not use it for real fares until the device checks pass. Change the trusted native path to the root only for the later production-signed release.

The browser fallback remains available but cannot promise continued location collection while hidden/locked. Native recording also depends on permission, GPS reception and OS operation. Force-stop, revoked permissions, reboot and long GPS gaps are not recoverable traveled-distance measurements. GPS fixes over 50m accuracy and implausible jumps are rejected; gaps are shown for review, never replaced by a route estimate. Passenger publishing requires connectivity and a valid session; sampling and recording can continue without connectivity.

## Deployment sequence and rollback

1. Export account records and retain the current Worker and Pages commit before testing.
2. Paste this branch's complete `cloudflare/worker.mjs` in Cloudflare's latest editable Worker version and deploy. Keep `DB=taxi-db` and `nodejs_compat`. Existing schema is sufficient; no table deletion or key reset.
3. Deploy this branch's frontend files together (index.html and assets). Preserve original files/assets. Keep the old Pages commit available for rollback.
4. Sign in using the existing account. Admin account tools are inside Settings. Create a dedicated test driver, never overwrite production ride history for tests.
5. Test in browser, then install native builds and run the field checklist below. Restore the previous Worker and frontend together if needed; do not restore an old database over new paid receipts.

## QA coverage and outstanding field checks

`npm test` runs real local HTTP/SQLite integration, a D1-shaped SQLite adapter, frontend VM interaction and structure checks. These are not a Cloudflare workerd execution or a real phone rendering test. Retained reference-function names are one check, not proof of feature equivalence.

- Each mode: select pickup/drop where applicable, start, wait, night, discount, end, pay, print/PDF and reload reports.
- Manual/Delivery: moving GPS updates must not change entered km; delivery contact details must survive receipts.
- Book/Sch: create/edit/delete, reminders/calendar export, load saved km/name/phone/fare, complete once.
- Driver rates: change own tariff, save/relogin; confirm other driver rates and existing receipts unchanged.
- Admin: create test driver, inspect reports, disable (session revoked), enable, and explicitly test key reset on the test account only.
- CRM: two rides with same optional phone aggregate; customers without contact details still appear in all receipts.
- Passenger: open link on second phone; coordinates/fare update, sharing off revokes it, completed does not become active again.
- Android and iPhone separately: drive a known route foreground, locked for 10 minutes, another app for 10 minutes; compare native distance and receipt. Test poor signal, tunnel, network loss and recovery. Use a passenger/helper for tests while driving.
- GPS uncertainty must be visible, never an invented exact road distance. Check native notification/indicator and location permission before each field test.
- Process kill/restart: native sampled distance persists; open app, sign in and restore. Confirm no duplicate receipt or double-counted distance. Unmeasured gaps must remain explicit.
- Check original voice controls, fuel/repair reports, receipt QR, WhatsApp and map/navigation on both actual phones; WebView capabilities differ from Chrome. Camera/microphone, popup/download handling may need platform-specific follow-up after field results.

Browser restore/import remains the existing administrator-import workflow; a working restore UI is not newly claimed in this release.
