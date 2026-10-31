# Data sources, status and licensing

The detailed source references, dates, retained point values and caveats are in [DATA_SOURCES.md](DATA_SOURCES.md), [MAP_AND_CATALOGUE.md](MAP_AND_CATALOGUE.md) and [ORGANIC_ADVISOR.md](ORGANIC_ADVISOR.md). Verify current terms and licence chains before redistribution or commercial/public usage; labels in an imported record are claims by the operator, not automatic legal verification.

| Data | Origin and use | Limits / attribution |
|---|---|---|
| Crop environmental ranges | historical FAO ECOCROP via pinned OpenCLIM/EcoCrop-ScrapeR mirrors | Historical indicative bands, no independent field validation. See source and use-table attribution caveats in DATA_SOURCES.md. |
| Historical useful-plant records | pinned ECOCROP source/use tables; 2,302 normalized-name records in inspected DB | 21 are linked to 21 separately scored profiles. Zero records had both `accepted_name` and `family` populated under the inspected JSON criterion. Names are not validated accepted taxa, cultivars, local cultivation or 20,000 recommendation-ready profiles. |
| Soil | ISRIC SoilGrids 2.0 REST with official WCS fallback; 12 dated point snapshots | CC BY 4.0 attribution; predictions with spatial/method uncertainty, no live field lab result. Rest/WCS may be down or rate-limited. |
| Weather / air | Open-Meteo forecast and air-quality APIs | Current model-derived estimates and timestamps, not growing-season normals, measured field weather or annual rainfall; commercial/noncommercial terms and fair use must be checked. |
| Place lookup | Photon (OpenStreetMap-derived) and Open-Meteo, user-submitted query | OSM/ODbL attribution as applicable; public fair-use and failure conditions. Missing GeoNames index means no bundled global offline fallback. |
| Imagery | EOX Sentinel-2 cloudless 2016/17 mosaic | CC BY 4.0; contains modified Copernicus Sentinel data 2016 and 2017. ~10 m historical, reasonable-use service; no guarantee or legal field boundaries. UI shows attribution. |
| Leaflet | locally bundled Leaflet 1.9.4 | BSD-2-Clause; accompanying notice retained. |
| Organic advice | FAO/ICAR/IPM/NPOP references identified in ORGANIC_ADVISOR.md | General guidance; certification and product approvals are context-specific. Natural ≠ harmless/certified. |
| Fonts and hero | DM Sans / DM Serif Display with included SIL OFL; generated replacement hero | Original hero and project LICENSE missing from source export. Confirm project licensing with owner before public redistribution. |

GBIF Backbone (CC BY 4.0, <https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c>) and World Flora Online backbone (CC0, <https://www.worldfloraonline.org/downloadData>) can help taxonomic reconciliation but do not independently establish cultivation or agronomic thresholds. The streaming importer accepts per-record source URL and licence; exact normalized-name duplicates are detected, existing IDs skipped, rejected rows reported. A licence string or URL is not independently validated. Source data, terms, accepted identity, taxonomic status, synonyms, species/cultivar rank and evidence of cultivation must be manually reviewed before import. Never assert the 20,000 goal has been met using synthetic benchmark rows.
