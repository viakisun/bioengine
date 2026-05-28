// SemanticOverlay — Iter 26 PR 4-1 (SSOT #187 원칙 2).
//
// Renders SkeletonGraph node visualHints directly. No hardcoded colors or
// shapes — to change a marker's appearance, edit
// `src/plant/skeleton/populator/visualHintDefaults.ts` (the populator's
// type → visualHint table). Overlay code stays untouched.
//
// Consumer note: this overlay reads only the graph; it does NOT import
// PlantBase / PlantState / cultivar. SSOT #187 architecture invariant.
//
// PR 4-2 will add edge.renderPolicy.visualHint + organAnchor.visualHint
// directly here without changing this PR's API surface.

import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Meshes/Builders/discBuilder';
import '@babylonjs/core/Meshes/Builders/torusBuilder';
import type {
  PlantSkeletonGraph,
  NodeVisualHint,
} from '../plant/skeleton/PlantSkeletonGraph';

export interface SemanticOverlayHandle {
  /** Update markers from a freshly built graph. Idempotent — internally
   *  disposes prior markers before rebuilding. */
  update: (graph: PlantSkeletonGraph) => void;
  setVisible: (v: boolean) => void;
  dispose: () => void;
}

interface MarkerCacheEntry {
  mesh: Mesh;
  /** Marker color key → material is cached so we don't blow up the material
   *  count when many nodes share a hint color. */
  colorKey: string;
}

/** Build (or fetch from cache) a material for a hex color. */
function ensureMaterial(
  scene: Scene,
  cache: Map<string, StandardMaterial>,
  hex: string,
): StandardMaterial {
  const existing = cache.get(hex);
  if (existing) return existing;
  const mat = new StandardMaterial(`semantic_${hex.replace('#', '')}`, scene);
  const c = Color3.FromHexString(hex);
  mat.diffuseColor = c;
  mat.emissiveColor = c.scale(0.85);
  mat.specularColor = new Color3(0.05, 0.05, 0.05);
  mat.disableLighting = true;
  cache.set(hex, mat);
  return mat;
}

/** Create one marker mesh for a node's visualHint. */
function createMarker(
  scene: Scene,
  name: string,
  hint: NodeVisualHint,
  parent: TransformNode,
  matCache: Map<string, StandardMaterial>,
): Mesh {
  // diameter ≈ markerSizeM; shape chosen from hint.
  const d = Math.max(0.0005, hint.markerSizeM);
  let mesh: Mesh;
  switch (hint.markerShape) {
    case 'disk':
      mesh = MeshBuilder.CreateDisc(name, { radius: d, tessellation: 12 }, scene);
      break;
    case 'ring':
      mesh = MeshBuilder.CreateTorus(name, { diameter: d * 2, thickness: d * 0.3, tessellation: 16 }, scene);
      break;
    case 'arrow':
      // Simple cone proxy.
      mesh = MeshBuilder.CreateCylinder(name, { diameterTop: 0, diameterBottom: d * 1.2, height: d * 3, tessellation: 8 }, scene);
      break;
    case 'sphere':
    default:
      mesh = MeshBuilder.CreateSphere(name, { diameter: d * 2, segments: 8 }, scene);
      break;
  }
  mesh.parent = parent;
  mesh.material = ensureMaterial(scene, matCache, hint.markerColor);
  mesh.isPickable = false;
  return mesh;
}

export function createSemanticOverlay(
  scene: Scene,
  parent: TransformNode,
): SemanticOverlayHandle {
  const root = new TransformNode('semantic_overlay_root', scene);
  root.parent = parent;
  let visible = false;
  root.setEnabled(visible);

  const matCache = new Map<string, StandardMaterial>();
  let markers: MarkerCacheEntry[] = [];

  function disposeMarkers(): void {
    for (const m of markers) m.mesh.dispose(false, true);
    markers = [];
  }

  function update(graph: PlantSkeletonGraph): void {
    disposeMarkers();
    let i = 0;
    for (const node of graph.nodes.values()) {
      if (!node.visualHint) continue;
      const mesh = createMarker(
        scene,
        `semantic_marker_${i++}`,
        node.visualHint,
        root,
        matCache,
      );
      mesh.position = new Vector3(node.pos.x, node.pos.y, node.pos.z);
      markers.push({ mesh, colorKey: node.visualHint.markerColor });
    }
  }

  function setVisible(v: boolean): void {
    visible = v;
    root.setEnabled(visible);
  }

  function dispose(): void {
    disposeMarkers();
    for (const mat of matCache.values()) mat.dispose();
    matCache.clear();
    root.dispose(false, false);
  }

  return { update, setVisible, dispose };
}
