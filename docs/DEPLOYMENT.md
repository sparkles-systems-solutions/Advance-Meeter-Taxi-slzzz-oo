# Deployment and migration

## Keep the existing GitHub Pages address

1. Provision a Node.js 24+ server with a persistent volume. This repository does not provision or pay for hosting.
2. Copy the repository onto that server; do not place `.env` or the SQLite database in a public web directory.
3. Copy `.env.example` to `.env`. Set:
   - `PORT=5055`
   - `AMT_DATABASE=/absolute/private/persistent/path/taxi.sqlite`
   - `AMT_ORIGIN=https://sparkles-systems-solutions.github.io`
   - `NODE_ENV=production`
4. Create accounts using `server/manage.mjs`. There is no public signup or default password.
5. Run the server under the operating system's service manager as an unprivileged user. It binds to `127.0.0.1` only.
6. Put an HTTPS reverse proxy on that same machine in front of port 5055. Use a valid certificate and expose HTTPS, not the raw backend port. Keep origin protection enabled. Ensure the proxy has appropriate body and request limits.
7. Set `window.AMT_CONFIG.apiBase` in `assets/config.js` to the backend HTTPS origin, for example your actual `https://api.your-domain.example` (replace this example; it is not a provisioned service). Do not include `/api`.
8. From a staging frontend on the permitted origin, verify sign-in, a test ride, payment, refresh/recovery and tracking expiry. Set the origin temporarily to the exact staging origin if needed; do not use `*`.
9. Review and merge the PR only after testing. Keep the existing publishing directory configuration; the root `index.html` remains the entry point.

Alternatively, serve everything through the Node server and use its HTTPS origin for `AMT_ORIGIN`; leave `apiBase` empty. The public asset allowlist does not expose `server/`, `.env` or `data/`.

## Account administration

```sh
node --env-file-if-exists=.env server/manage.mjs add-user driver01 driver
node --env-file-if-exists=.env server/manage.mjs reset-password driver01
node --env-file-if-exists=.env server/manage.mjs disable-user driver01
```

Password reset revokes account sessions. Disabling an account revokes sessions and tracking shares. The admin role can change its own account's tariff settings; this is not yet a central fleet-management console.

## Preserve existing data

Before replacing the old single-file site, use its **Download Manual Backup** button on every browser/device containing records. Existing localStorage records are not uploaded automatically.

On the backend machine, import a legacy backup into a chosen account:

```sh
node --env-file-if-exists=.env server/import-backup.mjs driver01 /private/path/old-backup.json
```

The import adds missing IDs, keeps existing IDs, validates record structure, and marks newly imported historical receipts. Their historical amounts are preserved and are **not certified against today's tariff**. Old app passwords and tariff settings are not imported. Configure the intended tariff separately before taking new rides. Browser-driven replacement of the database is intentionally disabled; export still works. Only an operator with server filesystem access can perform historical imports.

`Export unsaved data` produces a recovery state file (not the legacy backup format). Keep it private. When sync reports a conflict, export that file before reloading; compare it with the server state and reconcile records deliberately. There is no automatic conflict merging.

## Backups and restart

- Use an OS-level backup job and encrypted storage for the database directory. Stop the service before copying SQLite files, or use a SQLite-consistent backup tool; do not copy only the main file while WAL writes are active.
- Retain a tested off-machine backup. Five database snapshots are not protection against loss of the whole disk.
- Restarting the process preserves users, sessions, state and snapshots on persistent disk. Ephemeral hosting loses these files.
- Restore the entire database from a verified backup while the service is stopped. Do not place backup files inside the public repository.

## Mobile acceptance checks before launch

Test on actual Android Chrome and iOS Safari: sign-in, portrait/landscape, keyboard and dialogs, GPS permission denial/recovery, a measured route, app backgrounding, unsaved-state warning, payment reconnection, PDF and print. GPS in a browser is not a certified taxi meter and background tracking can be interrupted by the phone.
