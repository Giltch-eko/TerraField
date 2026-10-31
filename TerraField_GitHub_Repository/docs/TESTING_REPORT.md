# Testing report

## Baseline (before this audit's modifications), 2026-10-30
- Node v24.22.2; `npm test`: **43 passed / 44, one failed, zero skipped**. Failure: `tests/node_tests.js` expects absent `server/data/place-meta.json.gz` and offline GeoNames data.
- `TERRAFIELD_TEST_URL=http://127.0.0.1:8002 npm run test:advisor-browser`: **passed**; searched real Hyderabad and São Paulo, map/soil linkage, organic advisor, water/cost calculators, SQLite activity persistence and responsive widths.
- `/api/health`: returned SQLite, 21 crop profiles and 2,302 source records.
- User-visible public deployment, Windows launcher execution, Docker, manual assistive-technology testing and agricultural outcome validation were not performed.

Post-change results will be appended after execution; a feature is not verified merely because this document describes it.

## Final actual results (2026-10-30)
All commands executed locally under Node v24.22.2; browser suites used Chromium with `TERRAFIELD_TEST_URL=http://127.0.0.1:8003` and a separate test SQLite database. Evidence transcripts are in `tests/audit-evidence/`.

| Test | Outcome |
|---|---|
| `npm test` | **43/44 passed, 1 failed, 0 skipped**: missing `server/data/place-meta.json.gz`. This is the same baseline failure; it was not hidden or skipped. |
| `npm run test:audit` | **4/4 passed**: concave interior point and invalid geometry; CSV formula guard; additive old-report migration, server recomputation, tamper rejection, owner isolation and restart; non-overwriting catalogue imports. |
| `npm run test:audit-browser` | **PASS**: concave outline, interior coordinate, ha/acres, drawing undo, simulated drag-end plus edit undo, mobile result overflow, CSV download, save/reload/open and polygon restoration. |
| `npm run test:browser` | **PASS**: validation, API failure and retry, result/comparison, report open/edit, print CSS/headless PDF, four viewport widths, page errors. |
| `npm run test:enhanced` | **PASS**: map, profile/report, catalogue, responsive widths, simulated tile failure. |
| `npm run test:global-map` | **PASS**: real Hyderabad and São Paulo search, map, polygon, edit/cancel, session restore, source clearing, polar validation, simulated search failure, four widths. |
| `npm run test:advisor-browser` | **PASS**: soil-map linkage, advisor, water/cost calculations, plan persistence, responsive widths. |
| `npm run test:advisor` | **7/7 passed**: organic guide, farmer-input math, health/assistant limitations and plan persistence. |
| Plant rebuild check | `node tools/build-plant-library.js --check` verified 2,302 records against pinned source files. |
| Hosting port test | Started a separate server with `PORT=8004`, no `TERRAFIELD_HOST` or `TERRAFIELD_PORT`; process listener reported `0.0.0.0:8004`; `/api/health` returned status ok, SQLite, 21 profiles, 2,302 bundled records. This was local only, not cloud deployment. |
| Real providers | Open-Meteo weather through app at 17.385, 78.4867 returned 200 with current modelled data; SoilGrids at that urban point returned 404 no estimate (correctly surfaced). SoilGrids REST at 17.68, 78.18 returned 200 with depth/intervals. These are point-in-time observations, not availability guarantees. Hyderabad/São Paulo search succeeded in the browser test. OSM tile server returned HTTP 200 but `x-blocked: Access denied`; no fallback was added. |
| SQLite backup tool | Copied an existing backup through `node:sqlite` online backup API; destination integrity check `ok`, report count 5 matched source. A second run refused the existing destination. This was not a hosted restore. |

These are development tests, not proof of agronomic quality, provider uptime, public security, screen-reader access, real Windows execution, Docker operation, native print dialog, cloud storage, deployment or backups. The 20,000-row test uses synthetic fixtures, not real plants. No lint/build commands exist. Organic guidance was covered by passing baseline tests and advisor browser journey; no guarantees or product certifications were tested.

## Follow-up map placement change
The satellite map was removed from New Analysis and retained on Global Soil Data. On Node 24, `npm run test:soil-only-map` passed: no map or tile requests on analysis, map on soil, explicit point/polygon transfer, report restoration, mocked soil application preserving outline, and three viewport widths. `test:browser`, `test:advisor-browser`, `test:enhanced`, `test:audit-browser`, `test:global-map`, and `test:audit` also passed after updating browser tests for the new map location. External tiles remain subject to availability. The prior 43/44 backend result is historical; the full backend suite was not rerun for this page-placement change.
