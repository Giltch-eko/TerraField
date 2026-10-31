# Five illustrative profiles and expected outputs

These are synthetic demonstration inputs, **not regional field measurements**. Outputs below are deterministic for method version 1.0 and the bundled 21-crop subset. A 100 index is not a 100% probability of success. Equal scores are ordered alphabetically; displayed entries do not imply the other tied crops are less suitable. “Wet”, “cool” and “dry” are broad prototype season categories.

| Example | Texture | pH | Annual rainfall | Growing temperature | Humidity | Season | Expected top three (index / 100) |
|---|---|---:|---:|---:|---:|---|---|
| Warm, wet season | Loamy | 6.3 | 1,700 mm/yr | 27 °C | 78% | Warm / wet | Arabica coffee 100; Rice 100; Sugarcane 100 |
| Cool-season loam | Loamy | 6.8 | 825 mm/yr | 18 °C | 60% | Cool / dry | Barley 100; Canola 100; Chickpea 100 |
| Warm dryland | Sandy | 6.2 | 450 mm/yr | 30 °C | 42% | Warm / dry | Pearl millet 100; Sorghum 96; Cowpea 94 |
| Mild acidic highland | Sandy loam | 5.4 | 700 mm/yr | 19 °C | 70% | Cool / dry | Maize 97; Potato 96; Common bean 93 |
| Warm heavy soil | Clayey | 7.3 | 800 mm/yr | 30 °C | 65% | Warm / wet | Cotton 100; Cowpea 96; Okra 95 |

N, P and K are omitted in all five. The exact source inputs are in `server/data/examples.json`; regression assertions are in `tests/node_tests.js`.
