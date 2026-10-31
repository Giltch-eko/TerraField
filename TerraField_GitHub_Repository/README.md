# 1. TerraField — Crop Planning | HACK-P302

**2026 audit:** See [initial audit](docs/PROJECT_AUDIT.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md), [post-change test results](docs/TESTING_REPORT.md), [deployment guide](docs/DEPLOYMENT_GUIDE.md), [security](docs/SECURITY_AND_PRIVACY.md), and [known limitations](docs/KNOWN_LIMITATIONS.md). The prototype is not approved for public private-user data.

## 2. Project overview
TerraField is a student decision-support prototype for comparing crop options against field soil and climate inputs. Its screening indices are **not** probabilities, predicted yields, guarantees or validated agronomic advice. Consult a local expert and use reliable field measurements.

## 3. Problem statement
HACK-P302 — Crop Recommendation System: make crop suitability information more interpretable when users have differing field conditions.

## 4. Proposed solution
Enter field conditions, calculate and inspect a transparent ranked screening index, compare crops and optionally save a historical report. Only user-provided or explicitly labelled example/modelled inputs are used.

## 5. Implemented features
- Organic-first advisory prototype with attributed general soil and natural pest considerations, crop-screening explanations, farmer-input water/cost calculators, saved calendar tasks and a limited rule-based assistant. No synthetic input recommendations, pesticide registrations or disease diagnosis; this is not a complete locally verified organic cultivation plan. See [organic advisor limitations](docs/ORGANIC_ADVISOR.md).
- Real EOX Sentinel-2 satellite field explorer on **Global Soil Data** with submitted worldwide place/coordinate search, point/outline selection, zoom/pan, attribution and explicit profile handoff. New Analysis does not load or display the map. The 2016/17 imagery is historical and coarse, not live or a land survey.
- Existing TerraField frontend, form validation, five **synthetic** example profiles, dynamic results and explanations, comparisons, printing, and database-backed saved reports (open, rename, delete).
- Database-paginated reference catalogue of 2,302 historical source records (not 20,000 independently verified cultivated taxa); **only 21 separately profiled crops are scored**. Bundled dated SoilGrids points; optional online ISRIC soil, Photon/Open-Meteo location, weather and air-quality lookups. External services can fail. SoilGrids values are modelled point estimates, not lab readings.
- Workspace separation via a random browser-held bearer key. This is not an account system; clearing local storage loses access to reports.
- Source-export limitation: the original offline GeoNames files were not provided. Place-name search requires the online services; coordinate input and the 12 bundled soil snapshots remain available. The new hero image is AI-generated, replacing the missing original.

## 6. Technology stack
Vanilla HTML/CSS/JavaScript; locally bundled Leaflet 1.9.4; Node.js 24 built-in HTTP, fetch and SQLite; SQLite database; Playwright (development-only browser tests). No frontend build or production npm dependencies. Node 20 does not have the required `node:sqlite` API.

## 7. System architecture
Same-origin frontend → HTTP REST API → validation and scoring engine → SQLite reports/cache → JSON responses → frontend. Calculation is transient; **Save report** recalculates and persists a profile and result snapshot. Crop scoring profiles remain checked-in JSON; sourced plant records are seeded into indexed SQLite catalogue tables. Diagram and schema: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Method: [docs/METHOD.md](docs/METHOD.md).

## 8. Actual screenshots
Screenshots captured from the running app using Chromium and synthetic inputs:
- [Analysis](screenshots/01-analysis.png) · [Results](screenshots/02-results.png) · [Saved reports](screenshots/03-reports.png) · [Mobile](screenshots/04-mobile.png).
- [Satellite field explorer](screenshots/satellite-map.png) · [Plant catalogue](screenshots/plant-catalogue.png).
- [Print CSS PDF check](screenshots/print-check.pdf) (generated via headless Chromium; native system print dialog not tested).

## 9. Local installation
**Prerequisites:** Node.js 24.x (including npm), a modern browser, a writable project directory. Install from https://nodejs.org/; verify `node --version`. The bundled runtime is absent; `Start_TerraField.bat` uses an installed Node 24 if available (Windows execution not verified here).

```sh
# From the TerraField project root
node --version                         # 24.x
npm ci                                 # only needed for browser tests
node node-server/app.js                # API and static frontend at http://localhost:8000
# alternatively: npm start
```
No separate frontend build/server is needed: the Node backend serves the existing frontend and is independently runnable. SQLite schema is created automatically at startup in `server/terra.db`; no separate migration command or credentials are required. `DATABASE_PATH` selects a writable location. The additive catalogue migration and one-time ECOCROP seed run automatically on startup; back up an existing database before upgrading. See [map and catalogue notes](docs/MAP_AND_CATALOGUE.md). For browser tests, also run `npx playwright install chromium` and, on Linux, install Playwright's required OS libraries as instructed by the installer. To rebuild the plant library from the included pinned, checksummed sources, run `node tools/build-plant-library.js`; check with `node tools/build-plant-library.js --check`.

Back up the database **and** browser workspace key securely. The key is bound to the browser's origin; another browser or URL/port does not share it. Never commit the database, key, or `.env`.

## 10. Environment variables
See [.env.example](.env.example). These are shell environment variables, **not automatically loaded** from an `.env` file. Defaults: `TERRAFIELD_PORT` overrides hosting `PORT`, then defaults to 8000; `TERRAFIELD_HOST` defaults to 127.0.0.1 locally or 0.0.0.0 when `PORT` is set; `DATABASE_PATH=server/terra.db`; `TERRAFIELD_NO_BROWSER=1` suppresses automatic launch. Use 0.0.0.0 only when network exposure is intended and protected. Local examples:

```sh
TERRAFIELD_NO_BROWSER=1 DATABASE_PATH=server/terra.db node node-server/app.js
# PowerShell: $env:TERRAFIELD_NO_BROWSER='1'; node node-server/app.js
```

## 11. API documentation
[Full API reference](docs/API.md). All JSON, same-origin. Profile validation failures use HTTP 422 with `{ "error": "Please correct the highlighted fields.", "fields": {...} }`; unexpected errors return safe JSON. Routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | SQLite health and version |
| GET | `/api/crops`, `/api/plants`, `/api/examples`, `/api/regions` | Scoring profiles, legacy reference library, synthetic examples, dated snapshots |
| GET | `/api/catalogue`, `/api/catalogue/filters`, `/api/catalogue/{id}`, `/api/catalogue-crop/{cropId}` | Indexed search, filters, plant detail and scored-crop link |
| POST | `/api/recommendations` | Validate and calculate, **without saving** |
| GET, POST | `/api/reports` | List, calculate and save with workspace key |
| GET, PATCH, DELETE | `/api/reports/{id}` | Read, rename, delete owned report |
| GET | `/api/location/search?q=...`, `/api/soil?lat=...&lon=...&depth=...`, `/api/weather?lat=...&lon=...` | Online integrations with documented limits |

The original app uses reports rather than separate profile/analysis CRUD endpoints; those suggested endpoints were not added. Example (use a **synthetic** profile):

```sh
curl -sS http://localhost:8000/api/health
curl -sS http://localhost:8000/api/recommendations -H 'Content-Type: application/json' \
  -d '{"profile":{"soil_type":"loamy","ph":6.3,"rainfall":1700,"temperature":27,"humidity":78,"season":"wet"}}'
```
Health returns `{"status":"ok","database":"sqlite","method_version":"1.0","crop_count":21,"plant_reference_count":2302}`. Recommendations return profile, ranked crops, factors, warnings and method version. See the API reference for ownership, example report creation, validation limits and error codes. No CORS is enabled; use the same origin.

## 12. Database design
`reports` stores `id`, hashed workspace key, title, JSON profile/result snapshots and creation/update timestamps; an owner/date index supports listing. `soil_cache` stores lookup key, JSON data and expiry. New `catalogue_plants`, `catalogue_tags`, `catalogue_search` (FTS5) and `catalogue_migrations` tables support additive seeding, source records, filters and indexed name search. Parameterized SQL is used. Profiles are saved inside report snapshots, not separately normalized. Historical reports retain their original data. Crop thresholds and the source seed are versioned JSON/CSV files; the active catalogue is stored and searched in SQLite. See [architecture](docs/ARCHITECTURE.md).

## 13. Testing and actual results
Tests run 2026-10-30 with Node 24.22.2 and Chromium 141:

```sh
npm test                              # 43 passed, 1 failed: missing offline GeoNames index
# in another terminal, with server running on port 8000:
npm run test:browser                  # original browser regression
npm run test:enhanced                 # map/catalogue browser workflow
npm run test:global-map               # live search and deterministic failure/geometry checks
npm run test:advisor                  # advisory backend checks
npm run test:advisor-browser          # organic UI and soil map workflow
npm run test:audit                    # geometry, CSV and migration/ownership
npm run test:audit-browser            # concave polygon, export, saved outline
npm run test:soil-only-map             # page placement and field transfer
```

The one remaining backend failure is the original offline GeoNames index test; `place-meta.json.gz` and `world-places.tsv.gz` were absent from the supplied export. It has **not** been skipped or misreported. The omitted ISRIC fixture was newly retrieved from the official WCS and its hash is in `tests/fixtures/README.txt`. Regression tests cover SQLite restart persistence, ownership, report CRUD, validation, scoring, external adapters and database error handling. Enhanced tests include map tile failure, field outline/area, profile handoff, paginated catalogue, and an isolated 20,000-row synthetic benchmark (not real catalogue data). Browser automation covers example, invalid input, simulated API outage and retry, calculation, explanations, comparisons, save/refresh/reopen/edit, navigation, print CSS and four viewport widths. See [test evidence](docs/TESTING.md) and [global search notes](docs/GLOBAL_MAP_SEARCH.md) for limits and the checklist.

## 14. Deployment links
**Not deployed; no public frontend or API URL exists.** A Dockerfile and [deployment notes](docs/DEPLOYMENT.md) are provided for local/container evaluation. A public deployment needs a persistent volume, HTTPS, an actual security review and appropriate rate limiting and provider permissions; browser bearer keys do not provide production identity, recovery, or strong account security. Do not place private data on a public instance in its present state.

## 15. Team members and contributions
**To be supplied by the team:** names, roll numbers and verified individual contributions. No team details were supplied; do not submit fabricated details.

## 16. Limitations and future scope
The organic advisor is partial: it does not supply local crop-specific organic cultivation plans, pesticide or organic-product registrations, soil nutrient diagnoses, photo diagnosis, automated stage schedules, compatible rotation pairings, live prices or AI-generated advice. It cannot guarantee safety, yield or certification. See [implementation and safety limitations](docs/ORGANIC_ADVISOR.md).
The 20,000 sourced cultivated-record goal is not met; the 2,302 records have historical use evidence but are not independently verified accepted species or local cultivation. The satellite mosaic is old and ~10 m resolution; small boundaries may not be visible. Coordinates and finished polygons remain in browser session storage until cleared or the browser-tab session ends; dates and crop fields remain in memory. Saved reports now retain a validated completed polygon, approximate area and its representative point when aligned with the analysis; older reports have no outline. No outcome validation; no crop yield/profit prediction; no independent confidence claims. Required pH, soil texture, annual rainfall, temperature and a season selection must be supplied; optional unknowns are omitted, not set to zero. N/P/K are recorded but unscored. Different crops can use different denominators, so compare cautiously. Offline GeoNames dataset is missing; external lookups have availability and privacy limitations. SQLite is local and a hosted instance needs persistent storage, backups and a production security design. Native print dialog, public deployment, exact original assets and multi-user security are not verified. Team details and actual live URLs remain outstanding.

### Scoring summary
For each crop, pH (weight 30), growing-season temperature (25) and annual rainfall (25) score 100 within ECOCROP optimal ranges, decline linearly to 0 at absolute boundaries, and score 0 outside. If any is outside an absolute range the total is capped at 50. Texture adds up to 10; optional humidity and season add up to 5 each using **prototype heuristics**, not FAO rules. Missing optional inputs/crop factors are excluded and weights renormalized. Scores are rounded, ranked by score then name. [Full method and assumptions](docs/METHOD.md).

## 17. Acknowledgements
FAO ECOCROP and historical OpenCLIM/EcoCrop-ScrapeR mirrors; ISRIC SoilGrids (CC BY 4.0), Poggio et al. 2021, doi:10.5194/soil-7-217-2021; OpenStreetMap/Photon and Open-Meteo; Google DM Sans and DM Serif Display under the included SIL OFL notices; Leaflet (BSD-2-Clause); EOX Sentinel-2 cloudless 2016, CC BY 4.0, contains modified Copernicus Sentinel data 2016 & 2017. Detailed attributions and provider limitations: [data sources](docs/DATA_SOURCES.md). Original project license file was absent from the export; confirm licensing with the original owner before redistribution.

### Preparing a GitHub repository
No Git history or remote was supplied. Review the files and confirm licensing before creating a repository. From the project root, for a **new, empty** repository only:

```sh
git init
git add .
git status                         # review staged files; no database, .env, or keys
git commit -m "Prepare TerraField crop planning prototype"
# After creating an empty GitHub repository, supply its actual URL:
# git remote add origin <your-repository-URL>
# git branch -M main
# git push -u origin main
```

Do not run `git init` in place of an existing repository or force-push to an existing remote. The presentation is [TerraField_Presentation.pptx](TerraField_Presentation.pptx); the [demo outline](docs/DEMO.md) is not a recorded video. The presentation is from the earlier baseline and has not been updated for the satellite/catalogue enhancement. The full hackathon guide was not provided, so its independent requirements could not be checked beyond the 17 sections specified in the request.
