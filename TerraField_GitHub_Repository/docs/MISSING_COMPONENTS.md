# Missing components and remediation

Initial inventory as audited; see TESTING_REPORT.md for what was subsequently verified.

| Component / initial classification | Problem and impact | Proposed change / files | Verification |
|---|---|---|---|
| Windows launcher — BROKEN | Bundled Node runtime omitted, launcher refuses installed Node | `Start_TerraField.bat`: use installed Node 24 fallback; preserve bundled runtime option | Windows test if available; otherwise syntax/manual instructions and disclose untested |
| Field area / representative point — PARTIALLY IMPLEMENTED | Only hectares; concave centroid can fall outside | `client/field-map.js`, shared geometry library, `client/index.html`: acres and interior representative | Unit fixtures for concave rings, area and invalid geometry; browser |
| Polygon reports — MISSING | Geometry lost on save/reopen | `node-server/app.js`, geometry validation, `client/app.js`, field map; additive SQLite migration | Old-row compatibility, ownership, invalid/tampered polygons and browser save/reopen |
| CSV export — MISSING | Browser print/PDF only | `client/app.js`: local export with formula-injection defenses | Browser download and dangerous-cell tests |
| Host-provided port — PARTIALLY IMPLEMENTED | `PORT` ignored | `node-server/app.js`, `.env.example`, docs | Spawn Node with `PORT` and test health |
| Public report privacy — PARTIALLY IMPLEMENTED | Browser-held bearer secret is not accounts or production authentication | Document clearly; require appropriate independent auth, threat review and backups before real users | Existing owner isolation test is not a production security audit |
| Satellite fallback — MISSING | EOX outage leaves no base map | Investigate a genuinely permitted provider and test before adding. OSM standard tile request was blocked in this environment; do not spoof or bypass | Live compliant provider test; no fallback claim if blocked |
| Offline global search — BROKEN | GeoNames index absent, test fails | Only import an appropriately licensed complete compatible dataset; no fake results | Repeat offline-index tests against legitimately obtained files |
| Catalogue target / completeness — PARTIALLY IMPLEMENTED | 2,302 distinct normalized record names, 0 with both family and accepted name under the inspected criterion; taxonomic reconciliation incomplete | `tools/import-catalogue.js`, catalogue schema: sourced incremental import; do not pad counts | Imported real source audit, licence and duplicate tests |
| Historical/seasonal climate, field water, validated classes — MISSING | Current weather is not seasonal climate; no irrigation model in crop scoring | Acquire source-complete data and expert-reviewed methodology; no unsourced rules | Independent data and agronomic validation; unavailable in this environment |
| Public deployment — BLOCKED BY EXTERNAL SERVICE OR CREDENTIALS | No authorized accounts; free hosting loses SQLite; production security and licences unresolved | Prepare configuration and beginner deployment guide; require paid persistent disk or a genuinely implemented database migration | Public health, create/restart/reopen, backup/restore, security and provider-terms checks after user action |

## Post-implementation resolution
Bounded geometry/interior point, hectare/acre UI, drawing/edit undo, optional server-validated report geometry, CSV export with formula guards, hosting `PORT`, source visibility and non-overwriting importer are implemented; local test results are in [TESTING_REPORT.md](TESTING_REPORT.md). The Windows launcher was updated but has not been run on Windows. Satellite fallback, offline GeoNames, 20,000 real sourced records, long-term climate inputs, robust authentication and an actual public deployment remain unresolved for the reasons above. This is not a claim that every requested feature is complete.
