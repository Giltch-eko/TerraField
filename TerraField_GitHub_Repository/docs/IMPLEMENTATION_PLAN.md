# Implementation plan

1. Preserve current code and data in a source archive and SQLite-consistent backups; record baseline tests. Completed before modifications.
2. Add verified, bounded geometry handling for small user-drawn fields, an interior representative coordinate and area in hectares/acres. Add an additive report migration and restore polygons on reopen; reject invalid geometry server-side. No legal boundary claim.
3. Add safe client-side CSV report export, retain browser print/PDF, improve Windows installed-Node fallback and honor `PORT` for hosting while retaining existing local defaults.
4. Preserve the scoring model and data provenance. Do not manufacture 20,000 plants, soil observations, local farming advice, production authentication or a public deployment. Research compliant fallback/provider options; document blocked conditions.
5. Run baseline and post-change tests, migrations, geometry/API ownership, browser workflow, mobile, startup and relevant live providers; record exact failures and untested capabilities. Complete the requested architecture, API, data, security and deployment docs.

## Execution outcome
Steps 1–3 were implemented and verified within documented bounds. Existing records are protected by additive migration, consistent backups and non-overwriting import behavior. Source/privacy/deployment guides and actual test transcripts are provided. Step 4 external provider fallback, large licensed catalogue, historical climate and production identity remain open. Step 5 ran locally; Windows, Docker and public/cloud verification remain unperformed. See `PROJECT_AUDIT.md` final table and `TESTING_REPORT.md`.
