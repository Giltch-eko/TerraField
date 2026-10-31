# Database schema and migration

SQLite file defaults to `server/terra.db` or `DATABASE_PATH`. WAL journal mode and a 10-second busy timeout are set at initialization. One application instance is the supported hosting model. Migrations are additive at startup; back up first and verify restoration. Do not manually copy only the `.db` while it is running in WAL mode: use SQLite's backup API or a safely stopped database.

| Table | Fields and use |
|---|---|
| `reports` | `id` text primary key; `owner_hash` SHA-256 of browser key; `title`; `profile_json`; `result_json`; UTC `created_at`, `updated_at`; nullable `field_json` for validated geometry, area, reference point, method and source. Indexed `(owner_hash,created_at DESC)` |
| `farm_plans` | `owner_hash` primary key; `data_json`, `updated_at`; one plan per workspace |
| `soil_cache` | `key` primary key; `data_json`, integer `expires_at` |
| `catalogue_plants` | `id` primary key, scientific and display names, unique normalized `scientific_key`, sort name, source URL, licence, weed flag, optional screened crop ID, `data_json`, `updated_at`; indexed name and link |
| `catalogue_tags` | composite primary key `(plant_id,kind,value)`; indexed `(kind,value,plant_id)` |
| `catalogue_search` | SQLite FTS5 trigram virtual search index (SQLite also creates internal shadow tables) |
| `catalogue_migrations` | idempotent seed migration marker and timestamp |

`field_json` is added using `PRAGMA table_info` and `ALTER TABLE ... ADD COLUMN` only when missing. Old seven-column rows remain unchanged and read with null field. Owner key hash is not encryption and location data is readable in the file; restrict and encrypt backups using your own audited solution. There is no destructive automatic migration or account recovery. The importer skips existing IDs instead of overwriting them; distinguish same-ID skips from scientific-name collisions and review manually. Source-backed imports are batched and can partially commit on interruption; rerun and inspect counters. No production database backup or cloud restore has been verified here.
