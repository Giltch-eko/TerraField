> **Source-export restoration note (2026-10-30):** This file describes the original full bundle. The offline GeoNames index, original hero and original Windows runtime were omitted from the supplied export. Online place search and coordinate entry remain available; see the current README for verified status. The hero is an AI-generated replacement.

Organic planning endpoints, example request fields, workspace-key requirements and limitations are documented in [ORGANIC_ADVISOR.md](ORGANIC_ADVISOR.md#api-and-code-changes). These are deterministic tools, not an AI or disease-diagnosis service.

# TerraField REST API

All routes are same-origin and return JSON unless noted. Default local base is `http://localhost:8000`. Content-Type for POST/PATCH is `application/json`. Responses use UTF-8. A successful DELETE returns `204` and no body.

## Workspace ownership

Report routes require `X-Workspace-Key: <64 hexadecimal characters>`. The frontend generates 32 cryptographically random bytes and stores the hex key in browser localStorage. The server hashes it; reports from other keys are not returned and individual unauthorized IDs return `404` to avoid confirming existence. This is **bearer-token separation, not account authentication**. Safeguard the key. Clearing browser storage loses access.

For a terminal-only local test, `KEY=$(openssl rand -hex 32)` creates a fresh random workspace. Do not publish or share a real key.

## Profile schema

```json
{
  "name": "Illustrative warm field",
  "soil_type": "loamy",
  "ph": 6.3,
  "rainfall": 1700,
  "temperature": 27,
  "humidity": 78,
  "season": "wet",
  "nitrogen": null,
  "phosphorus": null,
  "potassium": null,
  "source": "example",
  "illustrative": true
}
```

| Field | Required | Validation / meaning |
|---|---|---|
| `soil_type` | Yes | `sandy`, `sandy_loam`, `loamy`, `silty`, `clay_loam`, `clayey` |
| `ph` | Yes | 0–14; dimensionless |
| `rainfall` | Yes | 0–10,000 mm/year; typical annual precipitation |
| `temperature` | Yes | −30–60 °C; mean growing-season air temperature |
| `humidity` | No | 0–100%; mean growing-season relative humidity |
| `season` | Yes | `wet`, `cool`, `dry` or `unknown` |
| `nitrogen`, `phosphorus`, `potassium` | No | 0–5,000 mg/kg plant-available lab values. **Recorded, not scored.** |
| `name` | No | Up to 80 characters |
| `latitude`, `longitude` | No | Both or neither; −90…90, −180…180 |
| `location` | No | User-supplied label, up to 120 characters |
| `source` | No | `manual`, `example`, `soilgrids_live`, `soilgrids_snapshot`; self-reported provenance |
| `illustrative` | No | Boolean; remains true when sample inputs are mixed with other data |
| `soil_retrieved_at` | No | Self-reported SoilGrids retrieval timestamp |
| `soil_depth` | No | SoilGrids layer: `0-5cm`, `5-15cm`, `15-30cm`, `30-60cm`, `60-100cm`, `100-200cm`. Older SoilGrids reports default to `0-5cm`. |
| `soil_method` | No | `rest`, `wcs_fallback`, or `snapshot` source metadata; older reports default appropriately. |
| `soil_ph_interval_90` | No | Original, self-reported SoilGrids pH prediction interval `{ "lower": 5.6, "upper": 8.8 }`. Preserved in reports as model uncertainty, even if pH was subsequently edited; not scored. |
| `weather_source`, `weather_time`, `weather_location` | No | `manual` or `open_meteo_current`; time and location are self-reported metadata, kept separately from the soil point |

Do not enter SoilGrids **total N in g/kg** as available nitrogen in mg/kg. This data source does not provide available P or K.

## Reference and health endpoints

- `GET /api/health`: `{ "status": "ok", "database": "sqlite", "method_version": "1.0", "crop_count": 21, "plant_reference_count": 2302 }`
- `GET /api/crops`: `{ "crops": [...] }`, the **21 scored profiles** including ECOCROP bands, source IDs and prototype humidity/season tags.
- `GET /api/plants`: `{ "metadata": {...}, "plants": [...] }`, the separate offline informational library (2,302 historical ECOCROP records, including 1,057 tree-life-form records). Each includes source ID/link, names/aliases, uses, life form, `source_weed_label`, valid ranges or null, and `screened_crop_id` when the plant is among the 21 scored crops. The reference set is filtered, incomplete and not a safety or suitability assessment. See DATA_SOURCES for provenance, direct-use filtering and missing use records. The endpoint returns the full library; the frontend hides 129 useful, source-weed-labelled records by default and filters and progressively renders locally. Users may choose to show the flagged records with warnings.
- `GET /api/examples`: five synthetic `examples`, each with a valid `profile`.
- `GET /api/regions`: attributed SoilGrids point snapshots, coordinates, retrieval dates, units and values. These are selected individual points, not country-level averages or complete global offline coverage.

## Calculate recommendations

`POST /api/recommendations`

```bash
curl -s http://localhost:8000/api/recommendations \
  -H 'Content-Type: application/json' \
  -d '{"profile":{"soil_type":"sandy","ph":6.2,"rainfall":450,"temperature":30,"humidity":42,"season":"dry"}}'
```

Returns `200` with a cleaned `profile`, all `rankings` in descending order, `missing_information`, `advisory`, `method_version` and `disclaimer`. A ranking contains `id`, `name`, `score`, `category`, `capped`, `factors`, `limiting_factors`, `weighted_factors_used`, `missing_crop_data` and a source URL. A factor has the input, optimal/absolute ranges, score, weight, status, explanation and source. The score is an index, not a probability. Calculating does **not** persist a report.

Invalid profiles return `422`, for example:

```json
{"error":"Please correct the highlighted fields.","fields":{"ph":"Soil pH is required.","soil_type":"Choose a soil texture."}}
```

## Save, retrieve, rename and delete

- `POST /api/reports` with workspace key and `{ "profile": {…}, "title": "Field A" }` returns `201`, an `id`, timestamp and server-recomputed `result`. An omitted title falls back to profile name or “Untitled field”. Supplied result objects are ignored.
- `GET /api/reports` with key returns `{ "reports": [...] }`, newest first (maximum 200).
- `GET /api/reports/{id}` returns the complete owned report.
- `PATCH /api/reports/{id}` with `{ "title": "New name" }` updates the title; 1–80 non-space characters.
- `DELETE /api/reports/{id}` deletes an owned report and returns `204`.

Example create:

```bash
KEY=$(openssl rand -hex 32)
curl -s -X POST http://localhost:8000/api/reports \
  -H 'Content-Type: application/json' -H "X-Workspace-Key: $KEY" \
  -d '{"title":"Demo","profile":{"soil_type":"loamy","ph":6.8,"rainfall":825,"temperature":18,"humidity":60,"season":"cool"}}'
```

Keep the response ID and the same key for subsequent requests. Report ID is an unguessable UUID, but ownership is still checked.

## External services

- `GET /api/location/search?q=Hyderabad%2C%20Telangana`: interactive place search, 1–120 characters. It searches a bundled 2026-10-28 GeoNames subset and, when available, Photon (OpenStreetMap) and Open-Meteo (GeoNames). Returns up to 30 `results`, each with a `name`, `kind`, `region`, `county`, `country`, coordinates and `source`; may include `also_sources` and a reference link. `search_status` is `online`, `partial` or `offline`; `providers` explains each source's status. A coordinate pair such as `17.385, 78.4867` returns `search_status: coordinates` without calling the providers. Queries are cached locally in memory (successful online results for 24 hours, other results for 30 seconds) and in-flight duplicates are coalesced. Per-process request spacing is at least 1.1 seconds per public online provider; a hosted multi-user deployment needs a shared application-wide limiter and a provider agreement or self-hosting. Search is triggered by the Search button, not autocomplete. The included 288,694 records are a subset, not a complete world gazetteer; services may be down or return no match. Reference coordinates may be approximate and a town centre can be masked by SoilGrids.
- `GET /api/soil?lat=17.68&lon=78.18&depth=15-30cm`: coordinates required; depth is optional, default `0-5cm`. Allowed layers are `0-5cm`, `5-15cm`, `15-30cm`, `30-60cm`, `60-100cm`, `100-200cm`. Returns mean `values` (`phh2o`, `sand`, `silt`, `clay`, `soc`, `nitrogen`, `cec`, `bdod`), and `intervals_90` entries such as `"phh2o":{"lower":5.6,"upper":8.8}` when available. Units are in [METHOD.md](METHOD.md). Also returns `texture_estimate`, source, `lookup_method` (`rest` or `wcs_fallback`), `depth`, `depth_cm`, nominal resolution, retrieval timestamp and `cache` (`live` or `cached`). Missing values/intervals remain null; intervals represent modelled nominal 90% prediction uncertainty, not accuracy or crop-outcome probabilities. REST results are cached for 24 hours; WCS fallback results for 10 minutes. The official WCS fallback provides only pH, sand and clay when available and no intervals. Up to five combined ISRIC REST/WCS calls are made per minute per process, so a fallback may be partial. Both provider services can fail or return masked cells.
- `GET /api/weather?lat=17.68&lon=78.18`: fetches Open-Meteo weather and air-quality feeds concurrently. On success it returns requested coordinates, `status` (`ok` or `partial`), `cache` (`live` or `cached`), a `notice`, and two independent sections: `weather` and `air_quality`. A partial response is `200` if at least one section can be validated; a completely unavailable or invalid pair returns `502` (or `429` if both are rate-limited). Each section has `status` (`ok`, `partial` or `unavailable`), `source`, `source_url`, `values`, `units`, and `issues`. Available sections also include provider model-valid local `time`, `timezone`, `utc_offset_seconds`, calculated `time_utc`, `interval_seconds`, UTC `retrieved_at`, `model_latitude`, `model_longitude`, `freshness` and `age_seconds`. Sections may have different model times, intervals and grid coordinates.

  `weather.values` contains `temperature_2m` (°C), `relative_humidity_2m` (%), `precipitation` (mm summed over the preceding returned interval), `wind_speed_10m` (km/h), `wind_direction_10m` (degrees from north, direction wind comes from), and `wind_gusts_10m` (km/h). `air_quality.values` contains `us_aqi`, `pm2_5` and `pm10` (μg/m³). Unsupported units, missing and out-of-range values become null with an issue; no missing value is replaced with zero. US AQI is not capped at 500. Model time over two hours old for weather or six hours for air is flagged `stale`; over five minutes in the future is flagged `future`. These are display heuristics, not accuracy guarantees. Full responses use a 60-second process cache; partial responses 15 seconds; identical in-flight requests are coalesced.

  For old clients, top-level `temperature`, `humidity`, `time` and `timezone` alias the weather section and are null/empty if unavailable. The response **never** contains an annual rainfall value or a growing-season average. Values are model estimates, not on-site sensor readings; retrieval time is not the model issue time. See DATA_SOURCES for privacy, fair use, source and uncertainty details.

## Errors

| HTTP | Meaning |
|---|---|
| 400 | Malformed JSON, invalid coordinates, depth or search |
| 401 | Missing or malformed report workspace key |
| 404 | Missing endpoint/report or a masked soil cell |
| 405 | Method not allowed |
| 413 | JSON request exceeds 32 KiB |
| 415 | Request body is not `application/json` |
| 422 | Invalid profile or report title; profile errors include `fields` |
| 429 | SoilGrids fair-use limit reached, or both Open-Meteo feeds rate-limited |
| 500 | Unexpected internal error; no stack trace is returned |
| 502 | External provider is unavailable or response is malformed |

## Database-backed plant catalogue (added)

The legacy `/api/plants` remains available and returns the original static file; the current UI uses the SQLite catalogue. All routes below are public reference data; no workspace key is required. No cross-origin API access is configured.

| Method | Path and parameters | Success | Errors |
|---|---|---|---|
| GET | `/api/catalogue?q=...&page=1&category=...&type=...&use=...&region=...&screened=yes&weeds=include` | 200 `{records,total,overall,page,page_size,pages,notice}`; page size 24; sorted by normalized source display name | 400 for search >120 characters, invalid page or oversized filters; 500 on internal failure |
| GET | `/api/catalogue/filters` | 200 `{category,type,use,region}`, each an array of `{value,count}` | 500 on internal failure |
| GET | `/api/catalogue/{id}` | 200 source record, including available names, source and licence | 404 absent; 500 on internal failure |
| GET | `/api/catalogue-crop/{cropId}` | 200 explicitly linked catalogue record | 404 no linked record; 500 on internal failure |

Parameters are optional. `page` is a positive integer; `screened=yes` restricts results to linked screening crops; `screened=no` selects unlinked reference records. `weeds=include` reveals source-labelled weeds, otherwise hidden. Filters match exact values provided by the filters endpoint; no region has been inferred where the source lacks it. Examples:

```sh
curl 'http://localhost:8000/api/catalogue?q=Zea%20mays&page=1&weeds=include'
curl 'http://localhost:8000/api/catalogue-crop/maize'
curl 'http://localhost:8000/api/catalogue/filters'
```

See [MAP_AND_CATALOGUE.md](MAP_AND_CATALOGUE.md) for schema, licensing, limits, migration and import.

**Report geometry update:** POST may contain optional `field.geometry` GeoJSON; server revalidates the polygon, recomputes area and interior representative point and requires matching profile coordinates. GET returns the field or null for older rows. See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for limits and response details. Never rely on a client-supplied area.
