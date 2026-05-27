// Iter 20 PR 1 — Marker primitives for petiole-stem junction debug overlay.
// Solid + wire spheres, lines, screen-space labels (Babylon GUI).
// All primitives push themselves into a caller-managed array for disposal.

import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import type { Control } from '@babylonjs/gui/2D/controls/control';

// ── palette ─────────────────────────────────────────────────────────────
export const C_STEM_NODE           = new Color3(0.05, 0.05, 0.05);  // 검정
export const C_EXPECTED_PURPLE     = new Color3(0.55, 0.20, 0.85);
export const C_STEM_ACTUAL         = new Color3(1.00, 0.85, 0.10);  // 노랑 wire
export const C_FIRST_VISIBLE       = new Color3(1.00, 0.45, 0.10);  // 주황
export const C_FIRST_VISIBLE_FAIL  = new Color3(1.00, 0.10, 0.10);  // 빨강 (emerge gap > 2mm)
export const C_LEAF_ACTUAL         = new Color3(0.10, 0.95, 0.95);  // 청록 wire (focus='all')
export const C_LINE_OK             = new Color3(0.70, 0.70, 0.70);
export const C_LINE_WARN           = new Color3(1.00, 0.45, 0.10);
export const C_LINE_FAIL           = new Color3(1.00, 0.10, 0.10);

export type V3Like = { x: number; y: number; z: number };

function makeUnlitMaterial(scene: Scene, name: string, color: Color3, wireframe: boolean): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.wireframe = wireframe;
  return mat;
}

export function mkSolidSphere(
  scene: Scene,
  name: string,
  pos: V3Like,
  color: Color3,
  diameter: number,
): Mesh {
  const s = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
  s.position = new Vector3(pos.x, pos.y, pos.z);
  s.material = makeUnlitMaterial(scene, `${name}_mat`, color, false);
  s.isPickable = false;
  s.renderingGroupId = 3;
  return s;
}

export function mkWireSphere(
  scene: Scene,
  name: string,
  pos: V3Like,
  color: Color3,
  diameter: number,
): Mesh {
  const s = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
  s.position = new Vector3(pos.x, pos.y, pos.z);
  s.material = makeUnlitMaterial(scene, `${name}_mat`, color, true);
  s.isPickable = false;
  s.renderingGroupId = 3;
  return s;
}

export function mkLine(
  scene: Scene,
  name: string,
  a: V3Like,
  b: V3Like,
  color: Color3,
): Mesh {
  const line = MeshBuilder.CreateLines(name, {
    points: [new Vector3(a.x, a.y, a.z), new Vector3(b.x, b.y, b.z)],
  }, scene);
  line.color = color;
  line.isPickable = false;
  line.renderingGroupId = 3;
  return line;
}

// ── GUI label (screen-space, linked to a mesh anchor) ───────────────────

export interface LabelHandle {
  control: Control;
  dispose(): void;
}

let sharedUiTexture: AdvancedDynamicTexture | null = null;
let sharedUiScene: Scene | null = null;

function getSharedUi(scene: Scene): AdvancedDynamicTexture {
  if (sharedUiTexture && sharedUiScene === scene) return sharedUiTexture;
  if (sharedUiTexture) {
    sharedUiTexture.dispose();
    sharedUiTexture = null;
  }
  sharedUiTexture = AdvancedDynamicTexture.CreateFullscreenUI(
    'docking-overlay-ui',
    true,
    scene,
  );
  sharedUiScene = scene;
  return sharedUiTexture;
}

export function mkBillboardLabel(
  scene: Scene,
  anchorMesh: Mesh,
  text: string,
  color: Color3,
  opts: { offsetY?: number; bgAlpha?: number } = {},
): LabelHandle {
  const ui = getSharedUi(scene);
  const wrap = new Rectangle();
  wrap.adaptWidthToChildren = true;
  wrap.adaptHeightToChildren = true;
  wrap.thickness = 0;
  wrap.background = `rgba(0,0,0,${opts.bgAlpha ?? 0.55})`;
  wrap.cornerRadius = 4;
  wrap.paddingLeft = 4;
  wrap.paddingRight = 4;
  wrap.paddingTop = 2;
  wrap.paddingBottom = 2;
  const tb = new TextBlock();
  tb.text = text;
  tb.color = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
  tb.fontSize = 11;
  tb.fontFamily = 'monospace';
  tb.resizeToFit = true;
  wrap.addControl(tb);
  ui.addControl(wrap);
  wrap.linkWithMesh(anchorMesh);
  wrap.linkOffsetY = opts.offsetY ?? -16;
  return {
    control: wrap,
    dispose: () => { wrap.dispose(); tb.dispose(); },
  };
}

/** Force-release the shared fullscreen UI texture. Call on scene teardown. */
export function disposeSharedDockingUi(): void {
  if (sharedUiTexture) {
    sharedUiTexture.dispose();
    sharedUiTexture = null;
    sharedUiScene = null;
  }
}
