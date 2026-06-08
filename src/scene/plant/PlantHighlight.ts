// W2.a~b (§18) — Visual mesh highlight integration.
//
// 시나리오의 task.type · task.targets를 받아 scene 내 fruit mesh outline +
// skeleton overlay 자동 활성/해제.
//
//   thinning  — 화방 target outline (red)
//   pruning   — skeleton overlay 자동 활성 (곁순·apex 위치 visual)
//   spray     — overlay 없음 (TaskPanel에 mini heatmap)
//   drive     — 카메라 헤드 시점만, mesh 표시 없음
//
// Mesh ID 규약 (SkinMeshPlant L980 patterns):
//   skinplant_truss_{seed}_a{axisIdx}_n{nodeIdx}/<child>_body
//
// truss ordinal = nodeIdx ASC 정렬 후 1-based 인덱스.

import { Color3, type Mesh, type Scene } from '@babylonjs/core';

export interface HighlightOptions {
  taskType?: string;
  /** task.targets에서 추출한 truss ordinal (1-based). null/undefined = 자동 (all) */
  trussOrdinal?: number | null;
  color?: string;
  width?: number;
}

const RED = Color3.FromHexString('#ff3333');

function collectTrussFruits(scene: Scene): Map<string, Mesh[]> {
  const map = new Map<string, Mesh[]>();
  for (const m of scene.meshes) {
    if (!m.name.includes('skinplant_truss_')) continue;
    if (!m.name.includes('_body')) continue;
    const match = m.name.match(/_a(\d+)_n(\d+)/);
    if (!match) continue;
    const key = `${match[1]}_${match[2].padStart(4, '0')}`;
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
    }
    arr.push(m as Mesh);
  }
  return map;
}

export function applyTargetOutline(scene: Scene, opts: HighlightOptions): void {
  const trussMap = collectTrussFruits(scene);

  for (const meshes of trussMap.values()) {
    for (const f of meshes) f.renderOutline = false;
  }

  if (opts.taskType !== 'thinning') return;

  const sortedKeys = [...trussMap.keys()].sort();
  const target = opts.trussOrdinal ?? null;
  const color = opts.color ? Color3.FromHexString(opts.color) : RED;
  const width = opts.width ?? 0.012;

  for (let i = 0; i < sortedKeys.length; i++) {
    const ordinal = i + 1;
    if (target != null && ordinal !== target) continue;
    const meshes = trussMap.get(sortedKeys[i]);
    if (!meshes) continue;
    for (const f of meshes) {
      f.renderOutline = true;
      f.outlineColor = color;
      f.outlineWidth = width;
    }
  }
}

export function clearAllHighlights(scene: Scene): void {
  for (const m of scene.meshes) {
    if (m.renderOutline) m.renderOutline = false;
  }
}

/** Parse `truss==N` from a task.target expression. Returns N if found, else null. */
export function extractTrussOrdinalFromTarget(expr?: string): number | null {
  if (!expr) return null;
  const m = expr.match(/truss\s*==\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
