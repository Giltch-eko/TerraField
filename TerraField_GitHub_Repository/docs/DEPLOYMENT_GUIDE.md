# Local use and deployment preparation

**Do not host real farmers' private data publicly with this prototype.** Browser-held bearer keys do not provide identity, account recovery, revocation or production authentication. A safe release needs independent security review, proper auth, authorization, TLS, abuse and rate limits, privacy notice/consent, provider term review and tested durable backups. The following is a preparation/staging guide, not a claim of deployed or secure service. No cloud or GitHub account was accessed here.

## Windows with VS Code
1. Install Node.js 24 LTS from <https://nodejs.org/>. Install VS Code. Extract the entire ZIP to a writable folder, e.g. `Documents\TerraField`—not inside the ZIP viewer. Open that folder in VS Code.
2. Open **Terminal → New Terminal** (PowerShell). Run `node --version`; it must show 24.x. If not recognized, reopen VS Code after Node installation. `npm --version` verifies npm. The Windows batch launcher prefers a bundled `runtime\node.exe` if present; it is absent from this export, so falls back to installed `node`. Batch behavior has not been executed on Windows here.
3. Run `npm start`. Open `http://localhost:8000` if it does not open. Leave terminal running; stop with Ctrl+C. Local SQLite `server\terra.db` is created when absent. Do not delete an existing DB. No `.env` is required; this server does not automatically read `.env`.
4. For tests, in a second terminal at the project root: `npm ci`, `npx playwright install chromium`, `npm test`, `npm run test:audit`, and, with the app still running, `npm run test:browser`, `npm run test:global-map`, `npm run test:advisor-browser`, `npm run test:audit-browser`. `npm test` currently has one real failure due to absent offline GeoNames files. Browser test URLs default to port 8000 except audit-browser (8003); for the latter run `$env:TERRAFIELD_TEST_URL='http://127.0.0.1:8000'; npm run test:audit-browser`. A browser test writes screenshots and creates test reports; use a separate test database to avoid mixing with user data.

### Back up and restore
Protect backups as confidential, including any farm coordinates. Keep the browser workspace key secure and separately backed up; it is stored under localStorage key `terrafield_workspace_key` and acts as a bearer credential. Never commit or share it. Losing it loses access; changing origin/browser also creates another workspace.

From project root in PowerShell, choose a NEW private backup path and run:
```powershell
node tools/backup-database.js server/terra.db "$HOME\Documents\terrafield-backup-2026-10-30.db"
```
The tool uses SQLite's online backup API (including WAL content) and refuses to overwrite an existing destination. Rotate off-device backups, encrypt and control access separately. To restore, stop TerraField, make an additional backup of the current DB and any WAL/SHM files, then copy the chosen verified backup to a NEW file path, for example `server\restore-test.db`. Set `$env:DATABASE_PATH='server/restore-test.db'` in a fresh terminal and run `npm start`; verify reports using the original workspace key and compare data. Do not overwrite your original database until you have tested restore and explicitly decided to replace it. Ensure no other process is using that target. This restores only SQLite, not browser localStorage.

## Prepare a new GitHub repository
Confirm project ownership and permission first: original project LICENSE is missing. On a new, empty repository only, review `.gitignore` and `git status` so no DBs, `.env`, credentials, personal backups, workspace keys or logs are staged. In VS Code terminal:
```powershell
git init
git add .
git status
git commit -m "Prepare TerraField prototype"
git branch -M main
# Create your own empty repository in GitHub, then paste its actual URL:
# git remote add origin YOUR_REPOSITORY_URL
# git push -u origin main
```
Do not run these commands over an existing repository or force push; use its normal branching/review process. No repository or remote was created in this audit.

## Render staging preparation (not verified)
Render's free web service filesystem is ephemeral, spins down after inactivity, and cannot attach persistent disks; **free Render will lose SQLite reports and imports on restart/redeploy**. As of the reviewed Render documentation, a paid web service plus persistent disk is required for SQLite persistence, is single-instance and has deployment downtime; confirm current pricing, terms and limits yourself: <https://render.com/docs/free>, <https://render.com/docs/disks>, <https://render.com/docs/web-services>. Alternatively use a provider with a genuine durable single-writer SQLite volume; PostgreSQL is **not** implemented in this project.

After source licensing and security are addressed, for an isolated staging account with synthetic data: connect your reviewed GitHub repository, create a Node web service on an eligible paid instance, mount a disk at `/var/data`, set build command `npm ci --omit=dev`, start command `npm start`, and set environment `NODE_VERSION=24.22.2`, `NODE_ENV=production`, `TERRAFIELD_NO_BROWSER=1`, `DATABASE_PATH=/var/data/terra.db`. Let Render supply `PORT`; leave `TERRAFIELD_PORT` and `TERRAFIELD_HOST` unset unless deliberately overriding. The app binds `0.0.0.0` automatically when `PORT` is present. Node.js 24 must be supported by your chosen service. Verify that the mounted path is writable by the service user. The supplied Dockerfile also binds port 8000 by default and honors platform `PORT` unless `TERRAFIELD_PORT` overrides it; Docker was not available/tested here.

After authorized deployment, test `/api/health`, actual search/tiles/soil failure behavior, create a synthetic report, restart/redeploy and reopen it from the same browser key, perform backup and restore into a separate test file, confirm HTTPS, inspect provider billing/terms and complete a security review. Render disk snapshots are not a substitute for a tested SQLite-native backup procedure. No public URL, live deploy, cloud persistence, hosted backups or production security test exists yet.
