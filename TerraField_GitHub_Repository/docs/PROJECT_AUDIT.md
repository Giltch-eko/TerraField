# Project audit — baseline 2026-10-30

## Inspected state
Actual project: reconstructed vanilla HTML/CSS/JavaScript frontend and Leaflet 1.9.4, served together with a dependency-light Node 24 HTTP API using built-in SQLite. The client uses same-origin `fetch` and `X-Workspace-Key` for its reports and farm plan. There is no React, separate frontend build, real user authentication, PostgreSQL adapter or external AI model. `package.json`, every entry point, API/router, engine, adapters, catalogue/importer, UI, configuration and existing tests were inspected. The working directory has no Git history. A source ZIP and consistent SQLite backups of the three existing DBs were created outside the project at `/home/user/TerraField_Audit_Backup/` before implementation; they contain private runtime data and are not part of the deliverable.

The local Node 24 server on port 8002 answered `/api/health`: 21 screening profiles and 2,302 catalogue source records. Node 20 on the environment PATH cannot run the required `node:sqlite`. Baseline `npm test` on Node 24: **43 passed / 44, one failed**, because the offline GeoNames index is absent; no tests were skipped. `npm run test:advisor-browser` passed against the local app, including real Hyderabad and São Paulo location searches. Baseline transcripts: `/home/user/baseline_terrafield_tests.txt` and `/home/user/baseline_terrafield_browser.txt`; delivery transcripts will be in `tests/`.

## Initial feature classifications
| Feature | Initial status | Evidence / risk |
|---|---|---|
| Startup, same-origin API, SQLite | WORKING AND VERIFIED | health response, Node 24 process, browser test; not a deployment |
| Search, EOX historical map, point and small polygon | WORKING AND VERIFIED | live browser test; 2016/17 imagery, no fallback base layer; offline GeoNames missing |
| Polygon area/representative point | PARTIALLY IMPLEMENTED | local polygons in hectares only; area-weighted centroid can be outside; outlines not saved to reports |
| Soil/observed weather | PARTIALLY IMPLEMENTED | real ISRIC/Open-Meteo adapters, mocked error tests; online services may fail; historical/seasonal weather is not integrated |
| Recommendation, compare | WORKING AND VERIFIED | 21 rules-based crop profiles; not validated, irrigation and N/P/K not scored |
| Indexed plant catalogue | PARTIALLY IMPLEMENTED | 2,302 distinct normalized-name records; family/accepted-name fields absent for all; 21 scored engine profiles, 21 linked IDs; not 20,000 verified taxa |
| Report CRUD | WORKING AND VERIFIED | SQLite and browser-key isolation tests; polygon/area absent, no authenticated accounts |
| Report export | PARTIALLY IMPLEMENTED | browser print/PDF path; no CSV |
| Organic advisor | PARTIALLY IMPLEMENTED | deterministic guidance and calculators; no verified local treatment, diagnosis or full organic growing plans |
| Global offline geocoder | BROKEN | index data omitted; original test fails ENOENT |
| Public deployment | BLOCKED BY EXTERNAL SERVICE OR CREDENTIALS | no account, public URL, persistent hosting or deployment verified; browser bearer key is not production authentication |
| Docker/Windows hardware | IMPLEMENTED BUT NOT VERIFIED | Docker unavailable here, no native Windows environment |

## Baseline defects
`Start_TerraField.bat` requires a bundled `runtime/node.exe` absent from the reconstructed export even if Node 24 is installed system-wide. Hosting-assigned `PORT` is ignored by the server unless `TERRAFIELD_PORT` is set. Render free instances have an ephemeral filesystem and cannot provide durable SQLite storage. Geospatial data is limited to small non-dateline, non-polar rings and historical low-resolution imagery. The importer's exact-name deduplication does not establish accepted taxonomy; same-ID updates can replace fields with incomplete submissions. No secrets or real `.env` were inspected or overwritten.

## Safety boundary
The app remains a prototype, not a validated agronomic model or secure multi-user platform. No public production release for private field data should be represented as safe until independent security review, robust authentication, abuse controls, durable backups and provider licensing are in place.

## Final feature status after implementation
| Feature | Final status | Change / evidence |
|---|---|---|
| Startup and hosting port | WORKING AND VERIFIED locally | `PORT` and bind address verified on 8004; not a hosted deploy |
| Map search, EOX imagery | WORKING AND VERIFIED at test time | Hyderabad/São Paulo search and browser workflow passed; historical licensed imagery; no verified fallback |
| Draw/edit/cancel/undo/area/interior point | WORKING AND VERIFIED for documented bounds | Concave fixture, UI outline/drawing undo, ha/acres, physical edit drag in global-map suite and simulated edit-undo in audit suite; no accessibility or survey certification |
| Report polygon, area, source and restoration | WORKING AND VERIFIED locally | additive migration, server validation and recomputation, browser save/reopen, legacy null and owner tests |
| Report CSV and print/PDF | WORKING AND VERIFIED with limits | CSV browser download and formula guards; print CSS and headless Chromium PDF, not native dialog |
| Soil/current weather | PARTIALLY IMPLEMENTED | live point tests passed or returned honest no-data; no historical seasonal climatology or field lab measurement |
| Recommendation and organic advisor | PARTIALLY IMPLEMENTED | existing validated-input test coverage and deterministic rules retained; no independent agronomic validation or local organic treatment approval |
| Catalogue and safe importer | PARTIALLY IMPLEMENTED | 2,302 historical names, only 21 linked screening profiles; test verifies skip instead of overwrite; 20,000 real sourced records not achieved |
| Offline global place index | BROKEN | data omitted; test remains failing |
| Public deployment and private user security | BLOCKED BY EXTERNAL SERVICE OR CREDENTIALS | hosting guide only; no cloud account, URL or production authentication/security assessment |
| Windows launcher / Docker | IMPLEMENTED BUT NOT VERIFIED | Windows Node 24 fallback and Docker PORT configuration added; native Windows/Docker unavailable |

## Follow-up: map placement
At the user’s request, the satellite map was subsequently removed from New Analysis and retained only on Global Soil Data. The soil map now offers explicit field transfer to New Analysis; see the follow-up test results in TESTING_REPORT.md.
