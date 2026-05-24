/**
 * dumpPlantBase — write a snapshot of a computed PlantBase to JSON for
 * diagnostic comparison against renderer output. Lets us separate
 * "PlantBase is wrong" from "renderer mis-interprets PlantBase".
 *
 *   npm run plant:dump -- --cultivar tomimaru-muchoo --seed 42 --day 100
 *
 *   → src/plant/__diag__/{cultivar}-{scenario}-{training}-seed{n}-day{d}.json
 */

// Node-only diagnostic CLI — run via `vite-node`. Node types aren't in
// the root tsconfig (the app code is browser-only), so we declare the
// few APIs we need locally to keep this file ts-strict.
// @ts-expect-error Node module — declared inline.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
// @ts-expect-error Node module — declared inline.
import { dirname, join } from 'node:path';
// @ts-expect-error Node module — declared inline.
import { fileURLToPath } from 'node:url';
declare const process: { argv: string[] };

import {
  GrowthEngine,
  getCultivar,
  DEFAULT_CLIMATE,
  type DailyClimate,
} from '@farmsim/tomato-engine';
import {
  ACTIVE_SCENARIO,
  setActiveScenario,
  ACTIVE_TRAINING,
  setActiveTraining,
} from '@farmsim/tomato-engine/ModelRegistry';
import { computePlantGeometry, type PlantBase } from '../PlantBase';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, '..', '__diag__');

interface CliArgs {
  cultivar: string;
  seed: number;
  days: number[];
  scenario: string;
  training: string;
  climate: DailyClimate;
  text: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val == null || val.startsWith('--')) {
        opts[key] = 'true';
      } else {
        opts[key] = val;
        i++;
      }
    }
  }
  return {
    cultivar: opts.cultivar ?? 'tomimaru-muchoo',
    seed: opts.seed ? Number(opts.seed) : 42,
    days: opts.days
      ? opts.days.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0)
      : [100],
    scenario: opts.scenario ?? 'current',
    training: opts.training ?? 'current',
    climate: DEFAULT_CLIMATE,
    text: opts.text === 'true' || opts.text === '1',
  };
}

interface PlantBaseDump {
  meta: {
    seed: number;
    day: number;
    cultivar: string;
    scenario: string;
    training: string;
    geometryMode: string;
  };
  mainAxis: AxisDump;
  sideShoots: AxisDump[];
  cotyledons: Array<{ side: number; sizeM: number; position: [number, number, number]; alpha: number }>;
  summary: {
    stemNodeCount: number;
    leafCount: number;
    activeLeafCount: number;
    trussCount: number;
    activeTrussCount: number;
    fruitCount: number;
    activeFruitCount: number;
    sideShootCount: number;
  };
}

interface AxisDump {
  order: number;
  parent: { axisIdx: number | null; nodeIdx: number | null };
  stemCurve: Array<{ idx: number; pos: [number, number, number]; rMm: number; ageD: number }>;
  leaves: Array<{
    nodeIdx: number;
    visible: boolean;
    reason: string;
    attach: [number, number, number];
    azDeg: number;
    droopDeg: number;
    sizeFactor: number;
    petLenM: number;
  }>;
  trusses: Array<{
    nodeIdx: number;
    visible: boolean;
    reason: string;
    origin: [number, number, number];
    azDeg: number;
    fruits: Array<{
      idx: number;
      visible: boolean;
      reason: string;
      pos: [number, number, number];
      diaMm: number;
      ripen: number;
      pedicelPts: Array<[number, number, number]>;
    }>;
    flowers: Array<{ idx: number; pos: [number, number, number]; bloom: number }>;
  }>;
  bud: Array<{ nodeIdx: number; state: string; visible: boolean; pos: [number, number, number] }>;
}

function r(n: number, d = 3): number {
  const k = 10 ** d;
  return Math.round(n * k) / k;
}
function v3(p: { x: number; y: number; z: number }): [number, number, number] {
  return [r(p.x), r(p.y), r(p.z)];
}
function deg(rad: number): number {
  return r((rad * 180) / Math.PI, 1);
}

function dumpAxis(axis: PlantBase['mainAxis']): AxisDump {
  return {
    order: axis.order,
    parent: { axisIdx: axis.parentAxisIdx, nodeIdx: axis.parentNodeIdx },
    stemCurve: axis.stemCurve.map((s) => ({
      idx: s.nodeIdx,
      pos: v3(s.position),
      rMm: r(s.radius * 1000, 2),
      ageD: r(s.age, 1),
    })),
    leaves: axis.leaves.map((l) => ({
      nodeIdx: l.nodeIdx,
      visible: l.visibility.visible,
      reason: l.visibility.reason,
      attach: v3(l.attachPosition),
      azDeg: deg(l.azimuthRad),
      droopDeg: deg(l.droopRad),
      sizeFactor: r(l.sizeFactor, 3),
      petLenM: r(l.petioleLengthM, 4),
    })),
    trusses: axis.trusses.map((t) => ({
      nodeIdx: t.nodeIdx,
      visible: t.visibility.visible,
      reason: t.visibility.reason,
      origin: v3(t.worldOrigin),
      azDeg: deg(t.azimuthRad),
      fruits: t.fruits.map((f) => ({
        idx: f.index,
        visible: f.visibility.visible,
        reason: f.visibility.reason,
        pos: v3(f.worldPosition),
        diaMm: r(f.diameterMm, 2),
        ripen: r(f.ripenStage + f.ripenFraction, 2),
        pedicelPts: f.pedicelCurve.map(v3),
      })),
      flowers: t.flowers.map((fl) => ({
        idx: fl.index,
        pos: v3(fl.worldPosition),
        bloom: r(fl.bloomProgress, 2),
      })),
    })),
    bud: axis.buds.map((b) => ({
      nodeIdx: b.nodeIdx,
      state: b.state,
      visible: b.visibility.visible,
      pos: v3(b.position),
    })),
  };
}

function dist3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** PlantBase invariants — fail loud if PlantBase is internally inconsistent.
 *  Run from the dump tool to gate Step 2 acceptance. */
function assertInvariants(plantBase: PlantBase): void {
  const issues: string[] = [];
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];

  for (const axis of allAxes) {
    // Stem curve length matches axis (off-by-one origin prefix is fine).
    if (axis.stemCurve.length === 0 && axis.leaves.length > 0) {
      issues.push(`axis order=${axis.order} has leaves but empty stemCurve`);
    }

    // Each leaf attach must equal the stem node it's anchored to.
    for (const leaf of axis.leaves) {
      const stem = axis.stemCurve.find((s) => s.nodeIdx === leaf.nodeIdx);
      if (!stem) {
        issues.push(`axis ${axis.order} leaf node ${leaf.nodeIdx}: no matching stem segment`);
        continue;
      }
      const d = dist3(leaf.attachPosition, stem.position);
      if (d > 0.001) {
        issues.push(
          `axis ${axis.order} leaf n${leaf.nodeIdx}: attach Δ ${(d * 1000).toFixed(2)}mm from stem`,
        );
      }
    }

    // Truss worldOrigin must be node position + (0, -0.02, 0).
    for (const truss of axis.trusses) {
      const stem = axis.stemCurve.find((s) => s.nodeIdx === truss.nodeIdx);
      if (!stem) {
        issues.push(`axis ${axis.order} truss n${truss.nodeIdx}: no matching stem segment`);
        continue;
      }
      const expectedY = stem.position.y - 0.02;
      const xz = Math.hypot(
        truss.worldOrigin.x - stem.position.x,
        truss.worldOrigin.z - stem.position.z,
      );
      const dy = Math.abs(truss.worldOrigin.y - expectedY);
      if (xz > 0.001 || dy > 0.001) {
        issues.push(
          `axis ${axis.order} truss n${truss.nodeIdx}: worldOrigin off — XZ Δ ${(xz * 1000).toFixed(2)}mm, Y Δ ${(dy * 1000).toFixed(2)}mm`,
        );
      }

      // Each fruit must carry exactly 4 pedicel control points.
      for (const fruit of truss.fruits) {
        if (fruit.pedicelCurve.length !== 4) {
          issues.push(
            `axis ${axis.order} truss n${truss.nodeIdx} fruit ${fruit.index}: pedicelCurve length ${fruit.pedicelCurve.length} (expected 4)`,
          );
        }
        // Visible fruits must have diameter > 0.
        if (fruit.visibility.visible && fruit.diameterMm <= 0) {
          issues.push(
            `axis ${axis.order} truss n${truss.nodeIdx} fruit ${fruit.index}: visible but diameter ${fruit.diameterMm}mm`,
          );
        }
      }
    }
  }

  // v4.1 — TrussBase floralSites invariants.
  for (const axis of allAxes) {
    for (const truss of axis.trusses) {
      if (!truss.floralSites || !truss.peduncleCurve || !truss.rachisCurve) continue;
      // 1. floralSites.length === initialSiteCount
      if (truss.initialSiteCount != null && truss.floralSites.length !== truss.initialSiteCount) {
        issues.push(`axis ${axis.order} truss n${truss.nodeIdx}: floralSites.length ${truss.floralSites.length} != initialSiteCount ${truss.initialSiteCount}`);
      }
      // 2. rachisCurve[0] ≈ peduncleCurve[last]
      const pedEnd = truss.peduncleCurve[truss.peduncleCurve.length - 1];
      const rachis0 = truss.rachisCurve[0];
      if (pedEnd && rachis0) {
        const d = dist3(pedEnd, rachis0);
        if (d > 0.001) {
          issues.push(`axis ${axis.order} truss n${truss.nodeIdx}: rachisCurve[0] Δ ${(d * 1000).toFixed(3)}mm from peduncleCurve[last]`);
        }
      }
      // 3. floralSites: pedicelCurve length, fruitAxisDir unit, fruitCenter offset, stage consistency.
      for (let si = 0; si < truss.floralSites.length; si++) {
        const site = truss.floralSites[si];
        if (site.pedicelCurve.length !== 4) {
          issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: pedicelCurve length ${site.pedicelCurve.length} (expected 4)`);
        }
        const pedStart = site.pedicelCurve[0];
        const pedLast = site.pedicelCurve[site.pedicelCurve.length - 1];
        if (pedStart && site.knuckle) {
          const d0 = dist3(pedStart, site.knuckle);
          if (d0 > 0.001) {
            issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: pedicelCurve[0] Δ ${(d0 * 1000).toFixed(3)}mm from knuckle`);
          }
        }
        // Knuckle ↔ rachisCurve index alignment: knuckle은 rachisCurve의
        // subset이므로 rachisCurve[si+1]과 좌표가 일치해야 함 (rachisCurve[0]
        // = peduncleEnd, rachisCurve[1..N] = knuckles).
        const expectedRachisIdx = si + 1;
        const expectedKnuckle = truss.rachisCurve[expectedRachisIdx];
        if (expectedKnuckle && site.knuckle) {
          const dK = dist3(site.knuckle, expectedKnuckle);
          if (dK > 0.001) {
            issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: knuckle Δ ${(dK * 1000).toFixed(3)}mm from rachisCurve[${expectedRachisIdx}]`);
          }
        }
        if (pedLast && site.fruitTop) {
          const dT = dist3(pedLast, site.fruitTop);
          if (dT > 0.001) {
            issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: pedicelCurve[last] Δ ${(dT * 1000).toFixed(3)}mm from fruitTop`);
          }
        }
        const axisDirLen = Math.hypot(site.fruitAxisDir.x, site.fruitAxisDir.y, site.fruitAxisDir.z);
        if (Math.abs(axisDirLen - 1) > 0.01) {
          issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: |fruitAxisDir| ${axisDirLen.toFixed(3)} (expected ≈1)`);
        }
        // Stage consistency
        if (site.stage === 'fruit-growing' || site.stage === 'ripening') {
          if (!site.fruit) {
            issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: stage=${site.stage} but site.fruit missing`);
          }
        }
        if (site.stage === 'bud' || site.stage === 'flowering' || site.stage === 'petal-drop') {
          if (!site.flower) {
            issues.push(`axis ${axis.order} truss n${truss.nodeIdx} site ${site.index}: stage=${site.stage} but site.flower missing`);
          }
        }
      }
    }
  }

  // Side-shoot anchoring: stemCurve[0] ≈ parent node position.
  for (let ai = 0; ai < plantBase.sideShoots.length; ai++) {
    const shoot = plantBase.sideShoots[ai];
    if (shoot.parentAxisIdx == null || shoot.parentNodeIdx == null) continue;
    const parent = [plantBase.mainAxis, ...plantBase.sideShoots][shoot.parentAxisIdx];
    if (!parent) {
      issues.push(`side shoot ${ai} (order=${shoot.order}): parent axis ${shoot.parentAxisIdx} not found`);
      continue;
    }
    const parentStem = parent.stemCurve.find((s) => s.nodeIdx === shoot.parentNodeIdx);
    if (!parentStem) {
      issues.push(
        `side shoot ${ai}: parent node ${shoot.parentNodeIdx} not in parent stemCurve`,
      );
      continue;
    }
    if (shoot.stemCurve.length === 0) continue;
    const d = dist3(shoot.stemCurve[0].position, parentStem.position);
    // First side-shoot node sits one internode away from the parent
    // (GrowthModel.populateSideShootChain: parent + dir × internodeM).
    // Tolerance covers internode 4-6cm + branch angle component ≤ ~12cm.
    if (d > 0.15) {
      issues.push(
        `side shoot ${ai}: stemCurve[0] Δ ${(d * 1000).toFixed(1)}mm from parent node ${shoot.parentNodeIdx} (>15cm)`,
      );
    }
  }

  if (issues.length > 0) {
    console.error('[plantbase] INVARIANT VIOLATIONS:');
    for (const m of issues) console.error('  - ' + m);
    throw new Error(`PlantBase invariant check failed: ${issues.length} issue(s)`);
  }
}

function buildDump(
  plantBase: PlantBase,
  cultivar: string,
  scenario: string,
  training: string,
): PlantBaseDump {
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
  const flatLeaves = allAxes.flatMap((a) => a.leaves);
  const flatTrusses = allAxes.flatMap((a) => a.trusses);
  const flatFruits = flatTrusses.flatMap((t) => t.fruits);

  return {
    meta: {
      seed: plantBase.seed,
      day: plantBase.day,
      cultivar,
      scenario,
      training,
      geometryMode: plantBase.geometryMode,
    },
    mainAxis: dumpAxis(plantBase.mainAxis),
    sideShoots: plantBase.sideShoots.map(dumpAxis),
    cotyledons: plantBase.cotyledons.map((c) => ({
      side: c.side,
      sizeM: r(c.sizeM, 4),
      position: v3(c.position),
      alpha: r(c.alpha, 2),
    })),
    summary: {
      stemNodeCount: plantBase.mainAxis.stemCurve.length,
      leafCount: flatLeaves.length,
      activeLeafCount: flatLeaves.filter((l) => l.visibility.visible).length,
      trussCount: flatTrusses.length,
      activeTrussCount: flatTrusses.filter((t) => t.visibility.visible).length,
      fruitCount: flatFruits.length,
      activeFruitCount: flatFruits.filter((f) => f.visibility.visible).length,
      sideShootCount: plantBase.sideShoots.length,
    },
  };
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** v4.1 — node-by-node ASCII timeline dump. Each node shows L for leaf,
 *  T<n> for truss with stage + organ markers. */
function renderAscii(
  plantBase: PlantBase,
  cultivar: string,
  scenario: string,
  training: string,
  day: number,
): string {
  const allAxes = [plantBase.mainAxis, ...plantBase.sideShoots];
  const flatTrusses = allAxes.flatMap((a) => a.trusses);
  const flatFruits = flatTrusses.flatMap((t) =>
    (t.floralSites ?? []).flatMap((s) => (s.fruit ? [s] : [])),
  );
  const liveFruits = flatFruits.filter((s) => s.visibility.visible).length;

  const lines: string[] = [];
  lines.push(`=== ${cultivar} seed ${plantBase.seed} / ${scenario} / ${training} / D${day} ===`);
  const apex = plantBase.mainAxis.stemCurve[plantBase.mainAxis.stemCurve.length - 1];
  const apexHeightCm = apex ? apex.position.y * 100 : 0;
  lines.push(
    `heightCm=${apexHeightCm.toFixed(0)}  ` +
      `trusses=${flatTrusses.length}  liveFruits=${liveFruits}  geometryMode=${plantBase.geometryMode}`,
  );
  lines.push('');

  // Main axis only (side shoots optional; LOD).
  const main = plantBase.mainAxis;
  const nodes = main.stemCurve;
  // Print top-to-bottom (apex to base).
  for (let i = nodes.length - 1; i >= 0; i--) {
    const seg = nodes[i];
    const truss = main.trusses.find((t) => t.nodeIdx === seg.nodeIdx);
    const leaf = main.leaves.find((l) => l.nodeIdx === seg.nodeIdx);

    let row = `  ● n${seg.nodeIdx.toString().padStart(2, '0')}  `;
    if (truss) {
      // v4.2 — site composition summary instead of single dominant stage.
      const sites = truss.floralSites ?? [];
      const stages = sites.map((s) => s.stage);
      const label = summarizeSites(stages);
      const order = main.trusses.indexOf(truss) + 1;
      const N = sites.length;
      const active = sites.filter((s) =>
        s.stage !== 'harvested' && s.stage !== 'aborted',
      ).length;
      const harvested = stages.filter((st) => st === 'harvested').length;
      const aborted = stages.filter((st) => st === 'aborted').length;
      const summary =
        `  sites=${N} active=${active}` +
        (harvested > 0 ? ` harvested=${harvested}` : '') +
        (aborted > 0 ? ` aborted=${aborted}` : '');
      row += `T${order} [${label}]:  ${stages.map(siteIcon).join(' ')}${summary}`;
    } else if (leaf) {
      const v = leaf.visibility;
      if (v.visible) {
        row += 'L';
      } else {
        row += `(${v.reason})`;
      }
    } else {
      row += '(empty)';
    }
    lines.push(row);
  }
  lines.push('  ▽ ground');
  return lines.join('\n');
}

/** v4.2 — multi-stage composition label.
 *  Single stage → bare label ("bud").
 *  Mixed       → "4 fruit-growing, 2 flowering" sorted by count desc.
 *  Empty array → "empty". */
function summarizeSites(stages: string[]): string {
  if (stages.length === 0) return 'empty';
  const counts = new Map<string, number>();
  for (const s of stages) counts.set(s, (counts.get(s) ?? 0) + 1);
  if (counts.size === 1) return [...counts.keys()][0];
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([s, n]) => `${n} ${s}`).join(', ');
}

function siteIcon(stage: string): string {
  switch (stage) {
    case 'bud': return '·';        // ·
    case 'flowering': return '✿';  // ✿
    case 'petal-drop': return '✾'; // ✾
    case 'fruit-set': return 'o';
    case 'fruit-growing': return 'O';
    case 'ripening': return '◉';   // ◉
    case 'harvested': return '|';
    case 'aborted': return '×';    // ×
    default: return '?';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(OUT_DIR);

  if (args.scenario !== 'current') setActiveScenario(args.scenario);
  if (args.training !== 'current') setActiveTraining(args.training);

  const activeScenarioName = ACTIVE_SCENARIO;
  const activeTrainingId = ACTIVE_TRAINING.metadata.id;

  console.log(
    `[plantbase] cultivar=${args.cultivar} seed=${args.seed} scenario=${activeScenarioName} training=${activeTrainingId} days=${args.days.join(',')}`,
  );

  const engine = new GrowthEngine();
  engine.setEnvironment({
    temperatureC: args.climate.T_avg,
    lightHoursPerDay: args.climate.daylight_hours,
    co2ppm: args.climate.CO2_ppm,
  });
  engine.addPlant({ seed: args.seed, cultivarName: args.cultivar });
  const genome = engine.getGenome(args.seed)!;
  const cultivar = getCultivar(args.cultivar);

  for (const d of args.days) {
    engine.simulatePlantToHour(args.seed, d, 0, args.climate);
    const plant = engine.computeState(args.seed, d);
    const physiology = engine.getPhysiologyState(args.seed) ?? undefined;
    const plantBase = computePlantGeometry(plant, { genome, cultivar, physiologyState: physiology });
    assertInvariants(plantBase);
    const dump = buildDump(plantBase, args.cultivar, activeScenarioName, activeTrainingId);
    const stamp = `${args.cultivar}-${activeScenarioName}-${activeTrainingId}-seed${args.seed}-day${d}`;
    const outPath = join(OUT_DIR, `${stamp}.json`);
    writeFileSync(outPath, JSON.stringify(dump, null, 2) + '\n');
    if (args.text) {
      const ascii = renderAscii(plantBase, args.cultivar, activeScenarioName, activeTrainingId, d);
      const textPath = join(OUT_DIR, `${stamp}.txt`);
      writeFileSync(textPath, ascii + '\n');
      console.log('\n' + ascii + '\n');
    }
    console.log(
      `  day ${d.toString().padStart(3)}  ` +
        `axes=${plantBase.sideShoots.length + 1} ` +
        `leaves=${dump.summary.activeLeafCount}/${dump.summary.leafCount} ` +
        `trusses=${dump.summary.activeTrussCount}/${dump.summary.trussCount} ` +
        `fruits=${dump.summary.activeFruitCount}/${dump.summary.fruitCount} ` +
        `mode=${plantBase.geometryMode}`,
    );
  }
  console.log(`[plantbase] wrote ${args.days.length} dumps to ${OUT_DIR}`);
}

main();
