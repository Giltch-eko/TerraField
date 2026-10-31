> **Source-export restoration note (2026-10-30):** This file describes the original full bundle. The offline GeoNames index, original hero and original Windows runtime were omitted from the supplied export. Online place search and coordinate entry remain available; see the current README for verified status. The hero is an AI-generated replacement.

# Recommendation method and safety

This is a transparent prototype, not the FAO ECOCROP model and not a scientifically evaluated predictor. ECOCROP is a source of broad crop environmental ranges; weights and the other rules below are project choices.

## Input and scoring

Required inputs: broad soil texture; pH 0–14; typical annual rainfall 0–10,000 mm/year; mean growing-season air temperature −30 to 60 °C; season (including “not sure”). Relative humidity 0–100% is optional. Available N, P and K are optional in mg/kg and are stored, but **do not influence the score**. Soil lab extraction methods and nutrient availability differ; total N from SoilGrids is not available N. No fertilizer recommendations are made.

Maximum weights: pH 30, temperature 25, annual rainfall 25, texture 10, humidity 5 and season 5. For each crop, only available factors are included in the denominator. Thus a crop whose texture range is missing has a different denominator; compare indices cautiously.

For pH, temperature and rainfall, let `a` and `b` be absolute minimum and maximum, `l` and `h` the optimal minimum and maximum, and `x` the input:

- `x` in `[l,h]` → 100.
- `a ≤ x < l` → `100 × (x−a)/(l−a)`.
- `h < x ≤ b` → `100 × (b−x)/(b−h)`.
- Outside `[a,b]` → 0; additionally cap the final index at 50 if any of these factors is outside an absolute range.

Factor scores are rounded to whole numbers, then combined as `round(sum(score × weight) / sum(weights used))`; Nearest-even rounding of the underlying binary value is used. Rankings are ordered by descending index, then name alphabetically. Thresholds ≥80 = “Strong match”; ≥60 = “Possible match”; otherwise “Needs review”. These labels are merely screening categories, not scientific confidence or likelihood.

### Texture

Prototype mapping: sandy / sandy loam = light; loamy / silty / clay loam = medium; clayey = heavy. If this class is in the ECOCROP optimal texture list, or the list says `wide`, factor = 100. If not optimal but listed as absolute/tolerated, factor = 55; otherwise 20. If there is no optimal texture list, omit texture entirely. This is a coarse matching rule, not a USDA classification.

For an optional SoilGrids fraction lookup, the prototype suggests **clayey** if clay ≥40%; otherwise **sandy** if sand ≥70% and clay <20%; otherwise **loamy**. It is a deliberately simple group derived from modelled fractions, not a texture-triangle analysis. Users can override it.

### Humidity and season

These are project-created illustrative bands/tags, not ECOCROP data. Humidity factor = 100 within the crop's band; outside it declines by 4 points per percentage-point difference, floored at zero. The bands live in `server/data/crops.json`. Season factor = 100 when the selected broad season is tagged (or `any` is tagged), else 40. `unknown` season and missing humidity are omitted. Regional planting calendars and cultivars vary, so do not interpret the tags as planting advice.

## Source conversions and interpretation

SoilGrids REST requests mean, Q0.05 and Q0.95 predictions for one selected depth at a point, nominal 250 m resolution. The six depths are 0–5, 5–15, 15–30, 30–60, 60–100 and 100–200 cm. The live adapter divides each raw mean and quantile by its returned `d_factor`: pH ÷10; texture fractions ÷10 to percent; organic carbon ÷10 to g/kg; total nitrogen ÷100 to g/kg; CEC ÷10 to cmol(+)/kg; bulk density ÷100 to kg/dm³. NULL/masked data stay missing. P and K are not supplied. The modelled nominal 90% interval from Q0.05–Q0.95 is not a point-accuracy guarantee and is not used in the screening scores. Predictions are uncertain and spatially generalized; the selected layer may not represent a crop's actual root zone. The bundled snapshots are dated 0–5 cm point estimates, not regional averages or complete offline global coverage.

ISRIC's REST service may be unavailable. A limited official WCS fallback attempts only mean pH, sand and clay, as fair-use capacity permits; other properties and intervals remain missing. Successful REST results are cached for 24 hours and fallback results for 10 minutes. Failed or masked cells are not invented. See [DATA_SOURCES.md](DATA_SOURCES.md) for service limitations and attribution.

Open-Meteo supplies modelled current temperature, humidity, precipitation and wind, and a separate CAMS-based air-quality forecast. These are not on-site measurements and weather values are not season averages; the user must verify them. The app copies only available temperature and humidity on request and never converts short-interval precipitation to annual rainfall. Model time and retrieval time are not forecast-issue time. Separate feeds can be partially or completely unavailable. See DATA_SOURCES for freshness thresholds and model limitations. The 2,302-record plant reference library is informational; only the independently profiled 21 crops are scored. ECOCROP describes its rainfall ranges as annual; annual totals alone do not describe seasonal timing, effective rainfall or irrigation.

## Other limitations

No crop-outcome validation has been performed. This tool does not model crop-specific seasonal timing, cultivar, frost extremes, effective rooting depth, salinity, drainage, organic matter management, irrigation, pests, water rights, land use, market demand or economics. Data input errors can change results. Consult local agricultural experts for high-impact decisions and use laboratory and local climate measurements where possible.
