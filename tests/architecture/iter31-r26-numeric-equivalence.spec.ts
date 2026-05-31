// Iter 31 R26 Numeric Equivalence — ★ 정합 검증 final.
//
// Goal:
//   Phase 0 baseline (commit 4029b6b 직후)과 Phase A~H 리팩토링 _후_ 산출값이
//   _byte-level_로 동일함을 검증. _계산이 어긋나지 않았다_의 명확한 증명.
//
// 3-layer equivalence:
//   1. Anchor level     — position diff < 1e-6 m, rotation diff < 1e-9 (quat double-cover)
//   2. Mesh vertex      — worldVertexSamples diff < 1e-6 m
//   3. Byte level       — SHA-256 worldVertexHash _정확히_ 동일
//
// Baseline:
//   `docs/iter31/r26-cleanup-baseline.json` (gitignored — Phase Z 전 /tmp에서 복원)
//
// Failure mode:
//   하나라도 diff > threshold이면 어느 anchor가 어떤 epsilon으로 깨졌는지 reporting.
//   → 깨진 phase _revert_ + 재진단.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASELINE_JSON = resolve(__dirname, '../../docs/iter31/r26-cleanup-baseline.json');

interface AnchorSample {
  anchorId: string;
  day: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
  petioleTipTangent: [number, number, number];
}
interface MeshSample {
  meshName: string;
  day: number;
  worldVertexSamples: Array<[number, number, number]>;
  worldVertexHash: string;
  vertexCount: number;
}
interface DaySnapshot {
  day: number;
  anchorCount: number;
  meshCount: number;
  anchors: AnchorSample[];
  meshes: MeshSample[];
}
interface Baseline {
  schemaVersion: 1;
  capturedAt: string;
  gitCommit?: string;
  days: DaySnapshot[];
}

const POS_EPS = 1e-6;   // 1 micron
const ROT_EPS = 1e-9;   // quaternion component
const VTX_EPS = 1e-6;

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } };
    };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

async function captureDay(page: Page, day: number): Promise<DaySnapshot> {
  await enter(page, day);
  const data = await page.evaluate(() => {
    type V3 = { x: number; y: number; z: number };
    type Quat = { x: number; y: number; z: number; w: number };
    type Anchor = {
      id: string;
      kind: string;
      position?: V3;
      rotation?: Quat;
      meshAnchorNodeId?: string;
      anchorNodeId: string;
    };
    type Bone = { p0: V3; p1: V3 };
    type Edge = { id: number; bonePath?: Bone[]; organAnchors?: Anchor[] };
    type Mesh = {
      name: string;
      isEnabled(): boolean;
      getVerticesData?(kind: string): Float32Array | null;
      getWorldMatrix?(): { m: Float32Array };
    };
    const w = window as unknown as {
      __skinplantGraph?: { edges: Map<number, Edge> };
      __debugScene?: { meshes?: Mesh[] };
    };
    const g = w.__skinplantGraph;
    if (!g) return null;

    const anchors: Array<{
      anchorId: string;
      position: [number, number, number];
      rotation: [number, number, number, number];
      petioleTipTangent: [number, number, number];
    }> = [];
    for (const edge of g.edges.values()) {
      for (const a of edge.organAnchors ?? []) {
        if (a.kind !== 'leaf_blade' || !a.position || !a.rotation) continue;
        const bonePath = edge.bonePath ?? [];
        const last = bonePath[bonePath.length - 1];
        const tangent: [number, number, number] = last
          ? [last.p1.x - last.p0.x, last.p1.y - last.p0.y, last.p1.z - last.p0.z]
          : [0, 0, 0];
        anchors.push({
          anchorId: a.id,
          position: [a.position.x, a.position.y, a.position.z],
          rotation: [a.rotation.x, a.rotation.y, a.rotation.z, a.rotation.w],
          petioleTipTangent: tangent,
        });
      }
    }

    function transform(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
      const wx = x * m[0] + y * m[4] + z * m[8] + m[12];
      const wy = x * m[1] + y * m[5] + z * m[9] + m[13];
      const wz = x * m[2] + y * m[6] + z * m[10] + m[14];
      return [wx, wy, wz];
    }

    const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
    const meshSamples: Array<{
      meshName: string;
      worldVertexSamples: Array<[number, number, number]>;
      hashInput: number[];
      vertexCount: number;
    }> = [];
    for (const m of meshes) {
      if (!m.name.startsWith('skinplant_leaf_') || !m.isEnabled()) continue;
      const positions = m.getVerticesData?.('position');
      const wm = m.getWorldMatrix?.();
      if (!positions || positions.length === 0 || !wm) continue;
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const corners: Array<[number, number, number]> = [
        [minX, minY, minZ], [maxX, minY, minZ],
        [minX, maxY, minZ], [maxX, maxY, minZ],
        [minX, minY, maxZ], [maxX, minY, maxZ],
        [minX, maxY, maxZ], [maxX, maxY, maxZ],
        [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
      ];
      const worldCorners = corners.map((c) => transform(wm.m, c[0], c[1], c[2]));
      const hashInput: number[] = [];
      for (let i = 0; i < positions.length; i += 3) {
        const wp = transform(wm.m, positions[i], positions[i + 1], positions[i + 2]);
        hashInput.push(wp[0], wp[1], wp[2]);
      }
      meshSamples.push({
        meshName: m.name,
        worldVertexSamples: worldCorners,
        hashInput,
        vertexCount: positions.length / 3,
      });
    }
    return { anchors, meshSamples };
  });

  if (!data) throw new Error(`day ${day}: __skinplantGraph not available`);

  const meshes: MeshSample[] = data.meshSamples.map((s) => {
    const buf = Buffer.alloc(s.hashInput.length * 8);
    for (let i = 0; i < s.hashInput.length; i++) buf.writeDoubleLE(s.hashInput[i], i * 8);
    const hash = createHash('sha256').update(buf).digest('hex');
    return {
      meshName: s.meshName,
      day,
      worldVertexSamples: s.worldVertexSamples,
      worldVertexHash: hash,
      vertexCount: s.vertexCount,
    };
  });

  const anchors: AnchorSample[] = data.anchors.map((a) => ({ ...a, day }));

  return { day, anchorCount: anchors.length, meshCount: meshes.length, anchors, meshes };
}

function quatDiff(a: number[], b: number[]): number {
  // Standard component-wise diff
  const direct = Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
    Math.abs(a[3] - b[3]),
  );
  // Double-cover (q ↔ -q represent same rotation)
  const flipped = Math.max(
    Math.abs(a[0] + b[0]),
    Math.abs(a[1] + b[1]),
    Math.abs(a[2] + b[2]),
    Math.abs(a[3] + b[3]),
  );
  return Math.min(direct, flipped);
}

test.describe('Iter 31 R26 — Numeric Equivalence vs Phase 0 Baseline', () => {
  test('EQUIVALENCE: refactor preserves anchor/mesh outputs (3-layer + hash)', async ({ page }) => {
    test.setTimeout(600_000);

    if (!existsSync(BASELINE_JSON)) {
      throw new Error(
        `Baseline not found: ${BASELINE_JSON}\n` +
        `Run Phase 0 spec first or restore from /tmp/r26-cleanup-baseline.json.`,
      );
    }
    const baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf-8')) as Baseline;

    type Fail = { kind: string; day: number; key: string; baseline: unknown; actual: unknown; diff?: number };
    const failures: Fail[] = [];

    for (const baselineDay of baseline.days) {
      const day = baselineDay.day;
      const snap = await captureDay(page, day);

      // 1. Counts must match
      if (snap.anchorCount !== baselineDay.anchorCount) {
        failures.push({
          kind: 'ANCHOR_COUNT_MISMATCH',
          day,
          key: 'anchorCount',
          baseline: baselineDay.anchorCount,
          actual: snap.anchorCount,
        });
      }
      if (snap.meshCount !== baselineDay.meshCount) {
        failures.push({
          kind: 'MESH_COUNT_MISMATCH',
          day,
          key: 'meshCount',
          baseline: baselineDay.meshCount,
          actual: snap.meshCount,
        });
      }

      // 2. Anchor-by-anchor diff
      const baselineAnchorsById = new Map(baselineDay.anchors.map((a) => [a.anchorId, a]));
      for (const cur of snap.anchors) {
        const ref = baselineAnchorsById.get(cur.anchorId);
        if (!ref) {
          failures.push({ kind: 'ANCHOR_NEW', day, key: cur.anchorId, baseline: '(absent)', actual: 'present' });
          continue;
        }
        // Position diff
        const posDiff = Math.max(
          Math.abs(cur.position[0] - ref.position[0]),
          Math.abs(cur.position[1] - ref.position[1]),
          Math.abs(cur.position[2] - ref.position[2]),
        );
        if (posDiff > POS_EPS) {
          failures.push({
            kind: 'POSITION_DIFF',
            day,
            key: cur.anchorId,
            baseline: ref.position,
            actual: cur.position,
            diff: posDiff,
          });
        }
        // Rotation diff (with double-cover)
        const rotDiff = quatDiff(cur.rotation, ref.rotation);
        if (rotDiff > ROT_EPS) {
          failures.push({
            kind: 'ROTATION_DIFF',
            day,
            key: cur.anchorId,
            baseline: ref.rotation,
            actual: cur.rotation,
            diff: rotDiff,
          });
        }
      }

      // 3. Mesh-by-mesh hash + vertex sample diff
      const baselineMeshesByName = new Map(baselineDay.meshes.map((m) => [m.meshName, m]));
      for (const cur of snap.meshes) {
        const ref = baselineMeshesByName.get(cur.meshName);
        if (!ref) {
          failures.push({ kind: 'MESH_NEW', day, key: cur.meshName, baseline: '(absent)', actual: 'present' });
          continue;
        }
        // Hash must match exactly
        if (cur.worldVertexHash !== ref.worldVertexHash) {
          failures.push({
            kind: 'VERTEX_HASH_DIFF',
            day,
            key: cur.meshName,
            baseline: ref.worldVertexHash.slice(0, 16),
            actual: cur.worldVertexHash.slice(0, 16),
          });
        }
        // Vertex samples diff
        for (let i = 0; i < cur.worldVertexSamples.length && i < ref.worldVertexSamples.length; i++) {
          const c = cur.worldVertexSamples[i];
          const r = ref.worldVertexSamples[i];
          const d = Math.max(Math.abs(c[0] - r[0]), Math.abs(c[1] - r[1]), Math.abs(c[2] - r[2]));
          if (d > VTX_EPS) {
            failures.push({
              kind: 'VERTEX_SAMPLE_DIFF',
              day,
              key: `${cur.meshName}#${i}`,
              baseline: r,
              actual: c,
              diff: d,
            });
            break;  // 한 mesh당 첫 fail만 report
          }
        }
      }
    }

    // Reporting
    // eslint-disable-next-line no-console
    console.log(`\n========== R26 NUMERIC EQUIVALENCE — ${failures.length} failures ==========`);
    if (failures.length === 0) {
      // eslint-disable-next-line no-console
      console.log('✅ All 3-layer equivalence checks passed (anchor + vertex + hash).');
      // eslint-disable-next-line no-console
      console.log(`   Baseline captured: ${baseline.capturedAt}`);
      // eslint-disable-next-line no-console
      console.log(`   Days verified: ${baseline.days.map((d) => `D=${d.day} (${d.anchorCount} anchors)`).join(', ')}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`❌ Equivalence FAILED — refactor changed numeric outputs.`);
      for (const f of failures.slice(0, 20)) {
        // eslint-disable-next-line no-console
        console.log(
          `  [${f.kind}] D=${f.day} ${f.key}` +
          (f.diff !== undefined ? ` diff=${f.diff.toExponential(3)}` : '') +
          ` | baseline=${JSON.stringify(f.baseline)} actual=${JSON.stringify(f.actual)}`
        );
      }
      if (failures.length > 20) {
        // eslint-disable-next-line no-console
        console.log(`  ... ${failures.length - 20} more failures truncated`);
      }
    }

    expect(failures, `expected 0 numeric equivalence failures (have ${failures.length})`).toEqual([]);
  });
});
