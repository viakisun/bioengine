# FarmSim Tomato Growth Model — Spec Sheet

This directory is the **scientific specification** of the FarmSim tomato
growth engine. The engine code (`packages/tomato-engine/src/*.ts`) does
not hardcode model parameters — every coefficient is read from one of
the files below at module load. Edit a JSONC value, save, and Vite HMR
reloads the parameter immediately — no rebuild needed.

The model implements:

- **Reduced TOMGRO 5-state** {N, LAI, W, W_f, W_m} (Jones, Kenig,
  Vallejos 1999, Trans. ASAE 42:255-265)
- **TOMSIM canopy photosynthesis** with Beer-Lambert light interception
  and LUE form (Heuvelink E. 1996, Ann. Bot. 77:71-80)
- **Gillaspy 3-phase fruit growth** (cell division → expansion →
  ripening; Gillaspy, Ben-David, Gruissem 1993, Plant Cell 5:1439-1451)
- **Marcelis abortion** under assimilate competition (Marcelis 1996,
  Physiol. Plant. 94:447-456)
- **CROPGRO-Tomato thermal time** with T_base = 10 °C
- **Korean smart-farm 적과 pruning baseline** (trussTargetFruitCount)

## Files

| File | Purpose |
|------|---------|
| `tomgro-v1.jsonc` | Global model parameters — LUE, k, Q10, T_base, abortion, diurnal envelope, LAI cap. All cultivars share these. |
| `cultivars/tomimaru-muchoo.jsonc` | F1 pink beefsteak (Sakata Seeds, K-smartfarm reference) |
| `cultivars/cherry-generic.jsonc` | Cherry tomato baseline |
| `cultivars/round-generic.jsonc` | Mid-size round baseline |
| `cultivars/beefsteak-generic.jsonc` | Large beefsteak baseline |
| `cultivars/roma-generic.jsonc` | Roma (paste) tomato — elongated H:W > 1 |

## Parameter Schema (high-level)

### Global (`tomgro-v1.jsonc`)
| Field path | Unit | Source | Default |
|-----------|------|--------|---------|
| `photosynthesis.LUE_gDM_per_mol_PAR` | g DM / mol PAR | Heuvelink 1996 | 3.5 |
| `photosynthesis.beerLambert_k` | – | Goudriaan 1986 (spherical leaves) | 0.7 |
| `photosynthesis.Q10` | – | Goudriaan & van Laar 1994 | 2.0 |
| `photosynthesis.maintenance_m_ref_per_day` | g/g/day | Heuvelink 1996 | 0.015 |
| `photosynthesis.Cf_conversion_efficiency` | – | Heuvelink 1996 | 0.7 |
| `photosynthesis.plantFootprintM2` | m² | K-smartfarm density | 0.4 |
| `thermalTime.T_base_C` | °C | CROPGRO-Tomato | 10 |
| `thermalTime.T_max_dev_C` | °C | CROPGRO upper limit | 32 |
| `abortion.threshold_ratio` | – | Marcelis 1996 / Frontiers 2015 | 0.25 |
| `abortion.lag_days` | day | Frontiers 2015 | 4 |
| `fruitGrowth.density_g_per_cm3` | g/cm³ | Gould 1992 | 1.04 |
| `fruitGrowth.DM_percent` | fraction | Heuvelink 1996 | 0.06 |
| `diurnal.temp_amplitude_C` | °C | greenhouse typical | 6 |
| `diurnal.phase_offset_hours` | hour | min@2:00 max@14:00 | 8 |
| `lai.defoliation_cap_base` | m²/m² | Heuvelink 1996 | 3.6 |
| `lai.defoliation_aggressiveness_factor` | – | tuning | 1.2 |
| `rngWarmup.discard_first_n` | – | Lehmer LCG quirk | 3 |

### Per-Cultivar (`cultivars/<name>.jsonc`)

- `phenology.{GDD_to_first_flower, GDD_per_truss, ...}` — CROPGRO standard
- `flowersPerTruss / fruitSetRate / potentialFruitMassG` — reproductive
- `morphology.{loculeCount, heightWidthRatio, ribbingStrength, ...}` —
  per-fruit Gaussian distributions (sampled at fruit set)
- `color.{fullRipeRGB, greenStageRGB, hueVariance}` — USDA-stage palette
- `pruning.{defoliationAggressiveness, trussTargetFruitCount}` — 적과
- `physiology.{SLA_m2_per_g, sinkStrength, gompertz...}` — TOMSIM allocation

## References

| Citation | Topic |
|---------|------|
| Heuvelink E. 1996. *Ann. Bot.* 77:71–80 | TOMSIM carbon balance |
| Jones J.W., Kenig A., Vallejos C.E. 1999. *Trans. ASAE* 42:255-265 | Reduced TOMGRO 5-state |
| Gillaspy G., Ben-David H., Gruissem W. 1993. *Plant Cell* 5:1439-1451 | 3-phase fruit growth |
| Marcelis L.F.M. 1996. *Physiol. Plant.* 94:447 | Sink strength + abortion |
| Goudriaan J., van Laar H.H. 1994 | Q10 maintenance, canopy integration |
| Spitters C.J.T. 1986. *Agric. For. Meteorol.* 38:217 | PAR sin² envelope |
| Gould W.A. 1992 | Tomato fruit density |
| PMC10482247 | Locule QTL (fas, lc) |

## Adding a New Cultivar

1. Copy `cultivars/tomimaru-muchoo.jsonc` to `cultivars/<new-name>.jsonc`
2. Edit `metadata.name`, `metadata.type`, parameters as needed
3. Cite the vendor spec or peer-reviewed measurement in `metadata.references`
4. Register the import in `packages/tomato-engine/src/ModelRegistry.ts`
   (add `import <name>Text from './cultivars/<new-name>.jsonc?raw'` and
   the corresponding entry in `CULTIVAR_JSONS`)
5. Add to `GreenhouseScene.ts`'s `pickCultivar()` distribution if you
   want it to appear in the multi-plant view

## Tuning Workflow (the point of the spec sheet)

The single-plant analysis mode is a **tuning laboratory**:

1. Open `tomgro-v1.jsonc` or a cultivar JSON in VS Code
2. Edit a parameter (e.g. LUE 3.5 → 4.0, or `trussTargetFruitCount: 4 → 5`)
3. Save the file
4. Vite HMR reloads — `ACTIVE_MODEL` automatically picks up the new value
5. The browser's Single-Plant Analysis mode re-simulates the next minute
   the user scrubs to. Inspector + TimelineChart show the new behaviour.
6. If the change improves the model (better match to literature numbers
   or photographs), commit the JSONC change with an explanatory message.

This is the same workflow as DSSAT / APSIM / WUR TOMSIM model
calibration — edit the spec sheet, observe the result, commit.

## Reproducibility

- Same `(seed, cultivar, minute)` → same `PhysiologyState`, always.
- Sim ID format: `cv=<cultivar> seed=<n> +M<minute>` (top bar of
  Single-Plant mode).
- Model version is in `tomgro-v1.jsonc → metadata.version`.

## A/B Comparison (future)

Sandbox mode (planned) will support side-by-side comparison of multiple
model JSONs — useful for "what if LUE were 4.0?" type experiments
without losing the baseline.

## Regression Testing

Run `npx vite-node packages/tomato-engine/test-hourly-equivalence.ts`
to confirm that any refactor preserves the canonical results:

- `stepDaily` × 50 == `stepHourly` × 1200 == `stepMinutely` × 72000
  (all 8 state fields, 0.0000% relative error)
- `simulatePlantToMinute` determinism across direct / multi-step /
  forward-then-rewind paths
