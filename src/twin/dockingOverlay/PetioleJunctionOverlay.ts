// Iter 20 PR 3 — Reusable petiole-stem junction overlay (Skin + Skeleton modes).
// Receives PetioleJunctionPair[] and renders the spheres / lines / labels per
// the user-specified color spec. Caller owns lifecycle via the returned handle.

import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

import {
  mkSolidSphere, mkWireSphere, mkLine, mkBillboardLabel,
  C_STEM_NODE, C_EXPECTED_PURPLE, C_STEM_ACTUAL, C_FIRST_VISIBLE,
  C_FIRST_VISIBLE_FAIL, C_LEAF_ACTUAL, C_LINE_OK, C_LINE_WARN, C_LINE_FAIL,
  type LabelHandle,
} from './markerPrimitives';
import type { PetioleJunctionPair } from './dockingPairs';

export type OverlayFocus = 'stem-junction' | 'all';
export type LabelMode = 'all' | 'worst' | 'none';

export interface OverlayOptions {
  edgeTypes?: string[];          // default ['petiole'] — only filter we honor for now
  focus?: OverlayFocus;          // default 'stem-junction'
  labelMode?: LabelMode;         // default 'all'
  worstN?: number;               // labelMode='worst' 시 상위 N개
  sphereDiameter?: number;       // default 0.006 (6mm — small marker)
}

export interface OverlayHandle {
  setData(pairs: PetioleJunctionPair[]): void;
  setOptions(opts: OverlayOptions): void;
  setVisible(v: boolean): void;
  isVisible(): boolean;
  dispose(): void;
}

const DEFAULT_OPTS: Required<OverlayOptions> = {
  edgeTypes: ['petiole'],
  // 'all' — stem-side(4) + leaf-side(2: petioleTip + leafBladeRoot) 모두 표시.
  // 사용자 명시: "줄기 끝 접합 부위 마커 / 잎 접합 부위 마커" 둘 다 필요.
  focus: 'all',
  labelMode: 'all',
  worstN: 5,
  sphereDiameter: 0.012,
};

function lineSeverity(delta_mm: number): 'OK' | 'WARN' | 'FAIL' {
  if (delta_mm <= 1) return 'OK';
  if (delta_mm <= 3) return 'WARN';
  return 'FAIL';
}

function colorForLine(sev: 'OK' | 'WARN' | 'FAIL') {
  return sev === 'OK' ? C_LINE_OK : sev === 'WARN' ? C_LINE_WARN : C_LINE_FAIL;
}

function colorForFirstVisible(emergeGap_mm: number) {
  return emergeGap_mm > 2 ? C_FIRST_VISIBLE_FAIL : C_FIRST_VISIBLE;
}

export function createPetioleJunctionOverlay(
  scene: Scene,
  parentNode: TransformNode,
): OverlayHandle {
  let visible = false;
  let currentPairs: PetioleJunctionPair[] = [];
  let opts: Required<OverlayOptions> = { ...DEFAULT_OPTS };
  const meshes: Mesh[] = [];
  const labels: LabelHandle[] = [];

  const clear = () => {
    for (const m of meshes) m.dispose();
    meshes.length = 0;
    for (const l of labels) l.dispose();
    labels.length = 0;
  };

  const pickLabelSubset = (pairs: PetioleJunctionPair[]): Set<string> => {
    if (opts.labelMode === 'none') return new Set();
    if (opts.labelMode === 'all') return new Set(pairs.map(p => p.pairId));
    // 'worst' — sort by max delta and take top N.
    const ranked = [...pairs].sort((a, b) => {
      const maxA = Math.max(
        a.expectedToActual_mm,
        a.actualOcclusionDepth_mm,
        Number.isFinite(a.emergeGap_mm) ? a.emergeGap_mm : 999,
      );
      const maxB = Math.max(
        b.expectedToActual_mm,
        b.actualOcclusionDepth_mm,
        Number.isFinite(b.emergeGap_mm) ? b.emergeGap_mm : 999,
      );
      return maxB - maxA;
    });
    return new Set(ranked.slice(0, opts.worstN).map(p => p.pairId));
  };

  const render = () => {
    clear();
    if (!visible) return;
    const filtered = currentPairs.filter(p => {
      // PetioleJunctionPair currently is petiole-only. edgeTypes is a
      // forward-compat hook for when other types share this overlay.
      if (!opts.edgeTypes.includes('petiole')) return false;
      return true;
    });
    const labelSet = pickLabelSubset(filtered);

    for (const p of filtered) {
      const tag = p.pairId;

      // 1. stem centerline node — small black solid.
      const stemMesh = mkSolidSphere(
        scene, `dock_stem_${tag}`, p.stemCenterNode, C_STEM_NODE, opts.sphereDiameter * 0.7,
      );
      stemMesh.parent = parentNode;
      meshes.push(stemMesh);

      // 2. expected stem-surface dock — purple solid.
      const expMesh = mkSolidSphere(
        scene, `dock_exp_${tag}`, p.expectedStemSurfaceDock, C_EXPECTED_PURPLE, opts.sphereDiameter,
      );
      expMesh.parent = parentNode;
      meshes.push(expMesh);

      // 3. actual rendered root — yellow wire.
      if (p.actualRenderedRoot) {
        const actMesh = mkWireSphere(
          scene, `dock_act_${tag}`, p.actualRenderedRoot, C_STEM_ACTUAL,
          opts.sphereDiameter * 1.15,
        );
        actMesh.parent = parentNode;
        meshes.push(actMesh);

        // line expected ↔ actual (Δ Q1)
        const sevExpAct = lineSeverity(p.expectedToActual_mm);
        const lineExpAct = mkLine(
          scene, `dock_l_expact_${tag}`,
          p.expectedStemSurfaceDock, p.actualRenderedRoot, colorForLine(sevExpAct),
        );
        lineExpAct.parent = parentNode;
        meshes.push(lineExpAct);
      }

      // 4. first visible point — orange (or red if emerge gap > 2mm).
      if (p.firstVisiblePoint) {
        const fvColor = colorForFirstVisible(p.emergeGap_mm);
        const fvMesh = mkSolidSphere(
          scene, `dock_fv_${tag}`, p.firstVisiblePoint, fvColor, opts.sphereDiameter * 0.85,
        );
        fvMesh.parent = parentNode;
        meshes.push(fvMesh);

        // line actual ↔ firstVisible (showing emerge path length)
        if (p.actualRenderedRoot) {
          const sevEmerge = lineSeverity(p.emergeGap_mm);
          const lineEmerge = mkLine(
            scene, `dock_l_emerge_${tag}`,
            p.actualRenderedRoot, p.firstVisiblePoint, colorForLine(sevEmerge),
          );
          lineEmerge.parent = parentNode;
          meshes.push(lineEmerge);
        }
      }

      // reference line stem center → expected (thin grey, always)
      const refLine = mkLine(
        scene, `dock_l_ref_${tag}`,
        p.stemCenterNode, p.expectedStemSurfaceDock, C_LINE_OK,
      );
      refLine.parent = parentNode;
      meshes.push(refLine);

      // focus='all' — add petiole tip + leaf actual.
      if (opts.focus === 'all' && p.petioleTip) {
        const tipMesh = mkSolidSphere(
          scene, `dock_tip_${tag}`, p.petioleTip, C_EXPECTED_PURPLE, opts.sphereDiameter,
        );
        tipMesh.parent = parentNode;
        meshes.push(tipMesh);
        if (p.leafBladeRoot) {
          const leafMesh = mkWireSphere(
            scene, `dock_leaf_${tag}`, p.leafBladeRoot, C_LEAF_ACTUAL,
            opts.sphereDiameter * 1.15,
          );
          leafMesh.parent = parentNode;
          meshes.push(leafMesh);
          if (p.tipToLeaf_mm != null) {
            const sevTip = lineSeverity(p.tipToLeaf_mm);
            const lineTip = mkLine(
              scene, `dock_l_tip_${tag}`,
              p.petioleTip, p.leafBladeRoot, colorForLine(sevTip),
            );
            lineTip.parent = parentNode;
            meshes.push(lineTip);
          }
        }
      }

      // label on the actual mesh (or expected if no actual).
      if (labelSet.has(p.pairId)) {
        const anchor = p.actualRenderedRoot
          ? (meshes.find(m => m.name === `dock_act_${tag}`) ?? expMesh)
          : expMesh;
        const labelText =
          `${p.shortLabel} `
          + `Δ=${p.expectedToActual_mm.toFixed(1)} `
          + `occ=${p.actualOcclusionDepth_mm.toFixed(1)} `
          + `emerge=${Number.isFinite(p.emergeGap_mm) ? p.emergeGap_mm.toFixed(1) : '∞'}mm`;
        const lbl = mkBillboardLabel(scene, anchor, labelText, C_EXPECTED_PURPLE);
        labels.push(lbl);
      }
    }
  };

  return {
    setData(pairs) { currentPairs = pairs; render(); },
    setOptions(o) { opts = { ...opts, ...o }; render(); },
    setVisible(v) { visible = v; render(); },
    isVisible() { return visible; },
    dispose() { clear(); currentPairs = []; visible = false; },
  };
}

