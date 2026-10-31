# TerraField — free first deployment (Render)

This bundle is prepared for a **first public demo deployment**. It does not mean the site has already been deployed: you must connect your own GitHub and Render accounts.

## What is already in this project

- Node.js 24 app with a same-origin frontend/backend.
- `npm start` starts the app.
- The server reads Render's `PORT` environment variable and binds to `0.0.0.0` when `PORT` is set.
- `GET /api/health` is configured as the health check.
- The current app uses keyless public endpoints for place search (Photon/Open-Meteo), soil data (ISRIC) and historical EOX Sentinel-2 satellite tiles. **You do not need to create a MapTiler key just to try the current implementation.** Public services have their own availability, attribution, privacy, and fair-use terms. Satellite imagery is labelled historical 2016/17, not live imagery.

## Step 1 — Upload the project to GitHub using the desktop app

1. Download and install GitHub Desktop from https://desktop.github.com/.
2. Create/sign into your GitHub account at https://github.com/.
3. Extract this ZIP into a normal folder, for example `Documents\TerraField`. Do not open it inside the ZIP viewer.
4. Open GitHub Desktop.
5. Choose **File → Add Local Repository** and select the extracted `TerraField` folder.
6. If GitHub Desktop says this is not a Git repository, choose the option to create a repository in that existing folder. Do not create an extra nested `TerraField` folder.
7. Confirm `.env`, database files, `node_modules`, and secrets are ignored by `.gitignore`. Do not add secrets or a real database file.
8. Create the initial commit if prompted.
9. Click **Publish repository**. Choose **Private** for now, unless you intentionally want the code public.
10. Wait for GitHub Desktop to finish publishing.

## Step 2 — Deploy it on Render

1. Create/sign into your account at https://render.com/.
2. In the Render dashboard, choose **New → Blueprint** (Render may label this as a Blueprint instance).
3. Connect the GitHub account and select the repository you just published.
4. Render should find `render.yaml` and show the `terrafield` web service. Review the settings before creating it.
5. Start the deployment. Render will run `npm ci --omit=dev`, then `npm start`.
6. Open the service's **Logs/Events** and wait for the deploy to finish successfully.
7. Open the generated `https://<your-service-name>.onrender.com` address shown in the dashboard. The exact name/link is assigned by Render and cannot be reserved by this file.
8. Test the website and open `https://<your-service-name>.onrender.com/api/health`. It should return a JSON health response.

If the deployment fails, copy the first relevant error from Render's deploy logs (do not share secrets) and use it to troubleshoot. Do not repeatedly redeploy without reading the error.

## Step 3 — Updates later

After connecting the repository, edits committed and pushed to the connected branch can trigger a new deployment. Use GitHub Desktop: review changed files, enter a short commit message, choose **Commit to main**, then **Push origin**. Render can deploy the pushed changes automatically.

## Free hosting and database warning — read this

Render's free web service can sleep after inactivity and may take around a minute to wake up. Its filesystem is ephemeral. This project uses SQLite at `server/terra.db`, so reports and other writes saved to that local database may disappear after a restart, spin-down, or redeployment. The included free deployment is suitable for a demo/testing first launch, **not for storing important or private farmer data**.

For durable reports, the app must be migrated/configured to use a persistent managed database, such as a suitable PostgreSQL provider, and that integration must be tested before relying on it. Do not assume that creating a database account alone automatically connects this code to it. Render's own free Postgres database is time-limited (currently 30 days according to Render's free-tier documentation), so do not use it as permanent storage without checking current terms.

## API keys: free options

The current source uses keyless endpoints for its existing map/search/soil features, so there is no secret API key you must supply to start a demo. If you specifically want a personal map-provider key, create a MapTiler account at https://cloud.maptiler.com/ and create a key in its API Keys section. MapTiler documents free API keys and key restrictions here: https://docs.maptiler.com/guides/developer/credentials/api-key/ . Its free plan has usage limits and its imagery/services may differ from the EOX tiles already used by this project. Creating a key does **not** automatically switch TerraField to MapTiler; code/configuration changes would be needed to use it.

Never paste an API key into a public GitHub file or this chat. For a browser-visible map key, restrict allowed HTTP origins to your Render domain when supported by the provider. Private keys belong in Render's Environment settings and server-side code, never frontend JavaScript.

## Current limitations to understand before public sharing

- This is a student/research prototype, not a validated agronomy system.
- Recommendation scores are screening indices, not probabilities or yield guarantees.
- Satellite imagery is historical 2016/17, not live imagery or a survey-grade boundary.
- The catalogue has about 2,302 historical normalized records; only 21 crop profiles are scored by the recommendation engine. It does not yet contain 20,000 independently verified, recommendation-ready plants.
- The current report ownership design uses a browser-held bearer key, not full user accounts. Do not store sensitive farm data until proper authentication, privacy controls, and durable backups have been implemented and tested.
- Free service availability, limits, account verification, and pricing can change. Confirm current provider terms before relying on the service.
