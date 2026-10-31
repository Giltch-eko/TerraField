# TerraField enhancement report

## Findings
The existing vanilla JS/Node 24/SQLite application had a working 21-crop rule-based screener, persistent reports and a 2,302-record historical ECOCROP plant reference file. It had no interactive map; the library was loaded in full on the frontend. The user-referenced new screenshot was not attached.

## Changes
- Map: `client/field-map.js`, `client/vendor/leaflet/`, `client/index.html`, `client/styles.css`, `client/app.js`, and CSP in `node-server/app.js`. Real EOX 2016/17 satellite tiles, pan/zoom/reset, user point/polygon, approximate area, field information and profile/soil handoff. EOX attribution is displayed. No API key required. Imagery is old/coarse and cannot infer soil, boundaries, crop health or current crop.
- Catalogue: `node-server/catalogue.js`, additive changes to `node-server/app.js`, `client/catalogue-ui.js`, `tools/import-catalogue.js`, and supporting tests/docs. SQLite stores 2,302 distinct source-backed historical records; only 21 linked scoring profiles remain recommendable. Search/pagination/filter/detail use the new API. Legacy `/api/plants` remains. Exact-name deduplication is not full taxonomic synonym resolution.
- Documentation/tests: `docs/MAP_AND_CATALOGUE.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, README, package scripts, test transcripts and actual screenshots.

## Counts and limits
2,302 source-backed ECOCROP records; the requested 20,000 target is not met. The number of independently verified cultivated taxa is unknown. GBIF/WFO/Kew/USDA were investigated, not imported without evidence of compatible permissions and documented human uses. No plant images, region, accepted-name or family values were fabricated. No retraining or accuracy claim was made.

## Database, import and run
On startup the server creates `catalogue_plants`, `catalogue_tags`, `catalogue_search` (FTS5), and `catalogue_migrations` and seeds historical records transactionally, without deleting reports or the soil cache. See [MAP_AND_CATALOGUE.md](MAP_AND_CATALOGUE.md) for backup, format, sources, licensing and batch import. Use Node 24: `node node-server/app.js`, then open `http://localhost:8000`. No Node package installation is needed to run; for browser tests run `npm ci` and `npx playwright install chromium`.

## Tests
`npm test`: 36 passed / 37; one legacy GeoNames test fails because the original offline index was not supplied. Both `npm run test:browser` and `npm run test:enhanced` passed against the local server. Real EOX imagery returned HTTP 200 in the test browser; simulated tile failure was also tested. A disposable 20,000-row synthetic benchmark checked pagination/search, not real catalogue content. Migration and import idempotence/rejection were tested. No deployment, mobile device testing or independent agronomic validation was performed. See [TESTING.md](TESTING.md) for full detail and transcripts.

## Remaining work
Supply an appropriate licensed source and evidence for the remaining records, reconcile accepted names and synonyms with expert review, and add region/family/cultivar/image details only when sourced. Restore missing offline GeoNames files, obtain the original screenshot and licence file, and validate usability/security/deployment requirements. The map's polygon and optional metadata are session-only; only the selected coordinates and optional name carry into a saved report. The 2016/17 satellite mosaic is not sufficient for survey-grade boundaries or live crop monitoring.
