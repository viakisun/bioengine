# CSV Import — Field Authoring Cheatsheet

## Mode

Two CSV idioms are supported:

| Mode | Use | Example |
|---|---|---|
| **SCALAR** | Measured value (single plant, single observation) | `height_cm: 62.4` |
| **RANGE** | Reference target band | `height_cm_min: 65, height_cm_max: 85` |

Both modes must be **machine-parseable** — see binding rules below.

## Binding rules

| Rule | OK | NOT OK |
|---|---|---|
| Decimal | `62.4` | `62,4` |
| Range | `_min: 65, _max: 85` (two columns) | `"65 to 85"` (string range — **FORBIDDEN**) |
| Empty value | empty cell → `null` | `"N/A"`, `"-"`, `"?"` |
| Enum | exact match (`visible_bud`) | `"꽃봉오리"`, `"VisibleBud"`, `"visible bud"` |
| Boolean | `true` / `false` / `1` / `0` | `"yes"`, `"y"`, `"O"`, `"X"` |

## Required columns by CSV type

### `plant_snapshot.csv` (single row per plant×day)
```
experiment_id, plant_id, day, observation_date,
height_cm, stem_diameter_mm, node_count,
visible_leaf_count, expanded_leaf_count,
visible_truss_count, flowering_truss_count, fruiting_truss_count,
fruit_count_total
```

### `truss_snapshot.csv` (one row per truss×day)
```
experiment_id, plant_id, day, truss_id, truss_index, attached_node_index,
status,  ← enum: not_visible | visible_bud | flowering | fruit_set |
              fruit_expanding | ripening | harvest_ready | senescent
flower_bud_count, open_flower_count, fruit_set_count, visible_fruit_count,
largest_fruit_diameter_mm
```

### `leaf_snapshot.csv` (one row per leaf×day)
```
experiment_id, plant_id, day, leaf_id, node_index,
status,  ← enum: emerging | expanding | expanded | mature | senescing | shed
leaflet_count, petiole_length_cm, rachis_length_cm,
leaf_length_cm, leaf_width_cm, leaf_area_cm2,
azimuth_deg, elevation_deg, droop_angle_deg
```

### `fruit_snapshot.csv` (one row per fruit×day)
```
experiment_id, plant_id, day, fruit_id, truss_id, truss_index, position_in_truss,
status,  ← enum: flower | fruit_set | small_green | green_expanding |
              breaker | turning | red | overripe | harvested | aborted
diameter_mm, height_mm,
color_stage  ← enum: green | green_yellow | turning | red | dark_red
```

## Importing

```bash
# From the repository root:
npx vite-node growth-calibration/scripts/import-csv.ts \
  --plant-csv path/to/plant.csv \
  --truss-csv path/to/truss.csv \
  --leaf-csv  path/to/leaf.csv \
  --fruit-csv path/to/fruit.csv \
  --provenance measured \
  --out growth-calibration/experiments/EXP_ID/observations/
```

Outputs one PlantObservation JSON per (plant_id × day) cell, validated
against `growth-calibration/schema/validate.ts`.

## Common errors

- **"string range ... is FORBIDDEN"** — replace with `_min` / `_max` paired columns
- **"'XXX' not in allowed enum"** — fix the spelling/case; enum strings are exact
- **"missing required column"** — see template files in `growth-calibration/schema/csv-templates/`
- **"day mismatch between plant and truss rows"** — every truss/leaf/fruit row's `day`
  must match a plant row's `day` exactly

## Binding source

`growth-calibration/schema/csv_mapping_rules.jsonc` declares every column →
JSON path mapping. The parser refuses unknown columns silently (they're
preserved as `unknown` in the resulting JSON `qualityFlags`).
