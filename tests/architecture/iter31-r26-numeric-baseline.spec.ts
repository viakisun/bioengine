// Iter 31 R26 Numeric Baseline — 리팩토링 _전후_ 계산 정합 검증의 _기준_.
//
// Goal:
//   리팩토링 _전_ (R26 commit 4029b6b) 의 모든 leaf_blade anchor 산출값을
//   _byte-level_로 dump → 리팩토링 _후_ 동일성 증명 (Phase Z).
//
// 3-layer equivalence:
//   1. Anchor level     — position [3] + rotation [4]
//   2. Mesh vertex      — bbox corner 8개 sample world-space
//   3. Byte level       — SHA-256 hash of all vertices
//
// Output:
//   docs/iter31/r26-cleanup-baseline.json  (gitignored, local artifact)
//   docs/iter31/r26-cleanup-baseline-summary.md  (committed, 통계)

import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// D=10은 leaf 미발달 (anchor 0) — D=20부터 시작.
const DAYS = [20, 30, 45, 90] as const;
const OUTPUT_DIR = resolve(__dirname, '../../docs/iter31');
const BASELINE_JSON = resolve(OUTPUT_DIR, 'r26-cleanup-baseline.json');
const SUMMARY_MD = resolve(OUTPUT_DIR, 'r26-cleanup-baseline-summary.md');

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
  worldVertexSamples: Array<[number, number, number]>;  // 8 bbox corners + 중심 = 9
  worldVertexHash: string;  // SHA-256
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

async function enter(page: Page, day: number) {
  await page.goto('/?quality=8', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
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

  // Collect anchors (rotation/position/petioleTipTangent) + mesh vertex hash.
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

    // Anchor sweep
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

    // Mesh sweep — world-space vertex 8 corners + 중심
    function transform(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
      // Babylon row-major 4x4 matrix m: [m00..m03, m10..m13, m20..m23, m30..m33]
      // world = (x, y, z, 1) * m  (column-major mul as Babylon does)
      const wx = x * m[0] + y * m[4] + z * m[8] + m[12];
      const wy = x * m[1] + y * m[5] + z * m[9] + m[13];
      const wz = x * m[2] + y * m[6] + z * m[10] + m[14];
      return [wx, wy, wz];
    }

    const meshes = (w.__debugScene?.meshes ?? []) as Mesh[];
    const meshSamples: Array<{
      meshName: string;
      worldVertexSamples: Array<[number, number, number]>;
      hashInput: number[];  // 전체 vertex world-space → hash
      vertexCount: number;
    }> = [];
    for (const m of meshes) {
      if (!m.name.startsWith('skinplant_leaf_') || !m.isEnabled()) continue;
      const positions = m.getVerticesData?.('position');
      const wm = m.getWorldMatrix?.();
      if (!positions || positions.length === 0 || !wm) continue;
      // bbox in mesh-local
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

      // Full vertex world transform → hash input
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

  // Compute SHA-256 in node (browser crypto.subtle is async + ESM-incompatible here).
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

  const anchors: AnchorSample[] = data.anchors.map((a) => ({
    ...a,
    day,
  }));

  return {
    day,
    anchorCount: anchors.length,
    meshCount: meshes.length,
    anchors,
    meshes,
  };
}

test.describe('Iter 31 R26 — Numeric Baseline Snapshot', () => {
  test('BASELINE-SNAPSHOT-01: dump anchor + mesh hashes for D=20/30/45/90', async ({ page }) => {
    test.setTimeout(600_000);

    const days: DaySnapshot[] = [];
    for (const day of DAYS) {
      const snap = await captureDay(page, day);
      days.push(snap);
    }

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const baseline: Baseline = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      gitCommit: process.env.GIT_COMMIT ?? undefined,
      days,
    };
    writeFileSync(BASELINE_JSON, JSON.stringify(baseline, null, 2), 'utf-8');

    // Acceptance — anchors + meshes present at all days
    for (const snap of days) {
      expect(snap.anchorCount, `D=${snap.day} anchor count`).toBeGreaterThan(0);
      expect(snap.meshCount, `D=${snap.day} mesh count`).toBeGreaterThan(0);
    }

    // BASELINE-SUMMARY-MD-01: 통계 md (committed)
    const summaryLines: string[] = [];
    summaryLines.push('# Iter 31 R26 Cleanup — Baseline Summary');
    summaryLines.push('');
    summaryLines.push(`Captured: ${baseline.capturedAt}`);
    summaryLines.push(`Source spec: tests/architecture/iter31-r26-numeric-baseline.spec.ts`);
    summaryLines.push('');
    summaryLines.push('## Per-day counts');
    summaryLines.push('');
    summaryLines.push('| Day | leaf_blade anchors | leaf meshes |');
    summaryLines.push('|-----|--------------------|-------------|');
    for (const s of days) {
      summaryLines.push(`| D=${s.day} | ${s.anchorCount} | ${s.meshCount} |`);
    }
    summaryLines.push('');
    summaryLines.push('## Position/rotation distribution (per day)');
    summaryLines.push('');
    summaryLines.push('| Day | pos.x range | pos.y range | pos.z range | rot.w range |');
    summaryLines.push('|-----|-------------|-------------|-------------|-------------|');
    for (const s of days) {
      if (s.anchors.length === 0) continue;
      const xs = s.anchors.map((a) => a.position[0]);
      const ys = s.anchors.map((a) => a.position[1]);
      const zs = s.anchors.map((a) => a.position[2]);
      const ws = s.anchors.map((a) => a.rotation[3]);
      const range = (arr: number[]) =>
        `[${Math.min(...arr).toFixed(3)}, ${Math.max(...arr).toFixed(3)}]`;
      summaryLines.push(
        `| D=${s.day} | ${range(xs)} | ${range(ys)} | ${range(zs)} | ${range(ws)} |`
      );
    }
    summaryLines.push('');
    summaryLines.push('## How to use');
    summaryLines.push('');
    summaryLines.push('1. Run this spec on R26 commit (4029b6b) to generate baseline.json.');
    summaryLines.push('2. Move `docs/iter31/r26-cleanup-baseline.json` to `/tmp/` (gitignored).');
    summaryLines.push('3. Execute Phase A~H refactoring.');
    summaryLines.push('4. Run `iter31-r26-numeric-equivalence.spec.ts` with baseline.json in place.');
    summaryLines.push('5. All 4 acceptance criteria (position/rotation/vertex/hash) must pass.');
    writeFileSync(SUMMARY_MD, summaryLines.join('\n') + '\n', 'utf-8');
  });
});
