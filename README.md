# Advance Meeter Taxi — authenticated server edition

This draft restructures the existing taxi meter and carries forward the mobile and QA fixes. It is **not deployed**. GitHub Pages can serve the frontend; the API needs a separate HTTPS server with persistent disk, or serve the whole application from that server.

## Files

- `index.html`: existing mobile interface, account gate and save status.
- `assets/app.css`: responsive screens, dialogs and receipt printing.
- `assets/app.js`: meter, schedules, reports, receipts and tracking controls.
- `assets/session.js`: server login, in-memory session and versioned database sync.
- `assets/config.js`: public API URL only.
- `server/`: authenticated API, SQLite storage and account administration.
- `test/`: access-control and frontend/API integration tests.
- `docs/DEPLOYMENT.md`: deployment and old-data import instructions.
- `docs/SECURITY.md`: security boundaries and remaining limitations.

## Local run (Node.js 24 or newer)

No third-party backend packages or npm install are required.

1. Copy `.env.example` to `.env`.
2. Create the initial administrator with a new password, entered at the prompt:

   ```sh
   node --env-file-if-exists=.env server/manage.mjs add-user admin admin
   ```

3. Start the server:

   ```sh
   node --env-file-if-exists=.env server/server.mjs
   ```

4. Open `http://localhost:5055/` and sign in. There is no default account/password.
5. Run checks with `node --test test/*.test.mjs`.

## What changed

- Login and authorization execute on the server. Passwords use salted scrypt hashes.
- Each account owns its database state; API reads/writes cannot choose another account.
- Version checks reject concurrent edits instead of silently overwriting them.
- Server validates billing inputs and recalculates new fares. Saved paid receipts are immutable.
- Payment receipt display waits for the database write. Save failures stay visible and unsaved work can be exported.
- Tracking is opt-in, authenticated for driver writes, and shared through random, expiring, revocable capability links. Phone numbers, delivery contacts and addresses are omitted from the public response.
- Login tokens and working data stay in memory rather than localStorage. Browser refresh requires signing in again; saved rides are restored from the database.
- Account data is saved in SQLite outside the public asset paths. The server keeps five recent automatic snapshots and an audit trail.

Do not merge to the Pages publishing branch until the API is deployed and `assets/config.js` points to it. Without the API, the new sign-in screen deliberately cannot open the driver console.
