import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { SCENARIO } from '../data/mockScenario';

export interface UwbAnchorsHandle {
  anchors: { id: string; position: Vector3; mesh: Mesh }[];
  rangeLines: Mesh | null;
  update: (robotPosition: Vector3) => void;
  setVisible: (v: boolean) => void;
}

const ANCHOR_COLOR = '#60a5fa';

export function createUwbAnchors(scene: Scene): UwbAnchorsHandle {
  const half = SCENARIO.bedLengthM / 2;
  const anchorY = 3.8;
  const anchorPositions: Array<{ id: string; pos: Vector3 }> = [
    { id: 'A1', pos: new Vector3(-half - 0.5, anchorY, -2.2) },
    { id: 'A2', pos: new Vector3(half + 0.5, anchorY, -2.2) },
    { id: 'A3', pos: new Vector3(-half - 0.5, anchorY, 2.8) },
    { id: 'A4', pos: new Vector3(half + 0.5, anchorY, 2.8) },
  ];

  const anchorMat = new PBRMaterial('anchorMat', scene);
  anchorMat.albedoColor = Color3.FromHexString('#1a1f28');
  anchorMat.metallic = 0.5;
  anchorMat.roughness = 0.4;

  const ledMat = new PBRMaterial('anchorLedMat', scene);
  ledMat.albedoColor = Color3.FromHexString(ANCHOR_COLOR);
  ledMat.emissiveColor = Color3.FromHexString(ANCHOR_COLOR);
  ledMat.metallic = 0;
  ledMat.roughness = 0.4;

  const anchors: { id: string; position: Vector3; mesh: Mesh }[] = [];
  for (const a of anchorPositions) {
    const root = new TransformNode(`uwb_${a.id}`, scene);
    root.position.copyFrom(a.pos);

    const housing = MeshBuilder.CreateBox(
      `uwb_${a.id}_housing`,
      { width: 0.14, height: 0.18, depth: 0.08 },
      scene
    );
    housing.parent = root;
    housing.material = anchorMat;

    const led = MeshBuilder.CreateSphere(`uwb_${a.id}_led`, { diameter: 0.04 }, scene);
    led.parent = root;
    led.position = new Vector3(0, 0.08, 0.04);
    led.material = ledMat;

    const mount = MeshBuilder.CreateCylinder(
      `uwb_${a.id}_mount`,
      { height: 0.5, diameter: 0.02 },
      scene
    );
    mount.parent = root;
    mount.position = new Vector3(0, 0.25 + 0.09, 0);
    mount.material = anchorMat;

    anchors.push({ id: a.id, position: a.pos.clone(), mesh: housing });
  }

  let rangeLines: Mesh | null = null;
  const rangeMat = new StandardMaterial('uwbRangeMat', scene);
  rangeMat.emissiveColor = Color3.FromHexString(ANCHOR_COLOR);
  rangeMat.alpha = 0.4;
  rangeMat.disableLighting = true;

  function rebuildRangeLines(robotPos: Vector3) {
    if (rangeLines) {
      rangeLines.dispose();
      rangeLines = null;
    }
    const linesPoints: Vector3[][] = [];
    const linesColors: Color4[][] = [];
    for (const a of anchors) {
      linesPoints.push([a.position, robotPos.clone()]);
      const distance = Vector3.Distance(a.position, robotPos);
      const a1 = Math.max(0.15, Math.min(0.6, 1 - distance / 25));
      linesColors.push([
        new Color4(0.376, 0.647, 0.98, a1),
        new Color4(0.376, 0.647, 0.98, a1 * 0.4),
      ]);
    }
    rangeLines = MeshBuilder.CreateLineSystem(
      'uwbRangeLines',
      { lines: linesPoints, colors: linesColors, useVertexAlpha: true },
      scene
    );
    rangeLines.isPickable = false;
  }

  return {
    anchors,
    get rangeLines() { return rangeLines; },
    update(robotPos) {
      rebuildRangeLines(robotPos);
    },
    setVisible(v) {
      anchors.forEach((a) => a.mesh.parent && (a.mesh.parent as TransformNode).setEnabled(v));
      if (rangeLines) rangeLines.setEnabled(v);
    },
  } as UwbAnchorsHandle;
}
