import * as THREE from 'three';
import { SeededRandom } from '../utils/SeededRandom';
import type { PlantState, NodeState } from '../simulation/GrowthModel';
import type { PlantGenome } from '../simulation/PlantGenome';
import { generateStem } from './StemGenerator';
import { createLeafGeometry, leafMaterial, yellowLeafMaterial, type LeafShapeParams } from './LeafGenerator';
import { generateTruss } from './TrussGenerator';

const DEG2RAD = Math.PI / 180;

export class PlantGenerator {
  private seed: number;
  genome: PlantGenome | null = null;

  constructor(seed: number) {
    this.seed = seed;
  }

  generate(state: PlantState): THREE.Group {
    const rng = new SeededRandom(this.seed);
    const group = new THREE.Group();
    group.name = `plant-${this.seed}`;

    if (state.nodes.length === 0) return group;

    // Stem with genome-based radius scaling
    const stemRadiusMul = this.genome?.stemRadiusMultiplier ?? 1;
    const stem = generateStem(state.nodes, rng.fork(1), stemRadiusMul);
    if (stem) group.add(stem);

    // Per-plant leaf shape params from genome
    const leafShape: LeafShapeParams | undefined = this.genome ? {
      serrationDepth: this.genome.leafSerrationDepth,
      serrationFreq: this.genome.leafSerrationFreq,
      lobeDepth: this.genome.leafLobeDepth,
      waviness: this.genome.leafWaviness,
      petioleLength: this.genome.leafPetioleLength,
    } : undefined;

    // Per-plant leaf material with hue bias
    const hueBias = this.genome?.leafHueBias ?? 0;
    let plantLeafMat = leafMaterial;
    let plantYellowMat = yellowLeafMaterial;
    if (Math.abs(hueBias) > 0.01) {
      const baseColor = new THREE.Color(0x3a9830);
      baseColor.offsetHSL(hueBias, 0, 0);
      plantLeafMat = leafMaterial.clone();
      plantLeafMat.color = baseColor;
      const yellowBase = new THREE.Color(0xaaB840);
      yellowBase.offsetHSL(hueBias, 0, 0);
      plantYellowMat = yellowLeafMaterial.clone();
      plantYellowMat.color = yellowBase;
    }

    // Cotyledons
    if (state.hasCotyledons && state.cotyledonSize > 0) {
      const cotGroup = this.createCotyledons(state, rng.fork(2));
      group.add(cotGroup);
    }

    // Leaves and trusses at each node
    for (const node of state.nodes) {
      if (node.leafMaturity < 0.05) continue;

      const nodeRng = rng.fork(100 + node.index);
      const nodeY = node.heightCm / 100;

      // Emergence scaling for newest node (smooth growth-in)
      const emScale = node.emergence ?? 1;

      // Compute 3D position of node on stem (with some offset from stem center)
      const stemXOff = nodeRng.gaussian(0, 0.003);
      const stemZOff = nodeRng.gaussian(0, 0.003);

      // Leaf direction from phyllotaxis angle
      const phyRad = node.phyllotaxisAngle * DEG2RAD;
      // Add per-plant variation to phyllotaxis
      const phyOffset = rng.range(-10, 10) * DEG2RAD;
      const leafDirX = Math.cos(phyRad + phyOffset);
      const leafDirZ = Math.sin(phyRad + phyOffset);

      // Age fraction for gravity-aware effects (0=young, 1=very old)
      const ageFrac = Math.min(1, (node.age ?? 0) / 80);

      // Leaf
      const leafGeo = createLeafGeometry(
        node.leafletCount,
        node.leafSizeFactor,
        node.leafMaturity,
        nodeRng.range(0.02, 0.15), // curl
        nodeRng,
        leafShape,
        ageFrac, // gravity aging: petiole sag, rachis droop, leaflet tilt
      );

      // Gravity-aware droop: real greenhouse tomato leaves hang steeply
      // Even young-ish leaves tilt 20-30°, mature leaves 70-100°+
      // droopExtra now includes weight-based component (larger leaves droop more)
      const baseDroop = 15 + ageFrac * 20; // 15°-35° base tilt
      const droopDeg = baseDroop + node.droopExtra * 1.0; // direct pass-through

      // Roll increases with age — mature leaves twist under their own weight
      const rollRange = 0.06 + ageFrac * 0.25; // young: ±3°, old: ±17°

      const leafMesh = new THREE.Mesh(
        leafGeo,
        node.yellowing > 0.3 ? plantYellowMat : plantLeafMat,
      );

      // Position and orient leaf
      leafMesh.position.set(stemXOff, nodeY, stemZOff);

      // Quaternion-based rotation: yaw → droop → roll
      const yaw = phyRad + phyOffset;
      const droopRad = droopDeg * DEG2RAD;
      const roll = nodeRng.range(-rollRange, rollRange);

      // 1. Yaw: rotate around world Y
      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), yaw
      );
      // 2. Droop: rotate around the perpendicular horizontal axis (gravity pull)
      const droopAxis = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const qDroop = new THREE.Quaternion().setFromAxisAngle(droopAxis, droopRad);
      // 3. Roll: twist around rachis direction (weight asymmetry)
      const rachisDir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      const qRoll = new THREE.Quaternion().setFromAxisAngle(rachisDir, roll);

      // Combine: droop * yaw * roll
      leafMesh.quaternion.copy(qDroop).multiply(qYaw).multiply(qRoll);

      if (emScale < 1) leafMesh.scale.setScalar(emScale);
      leafMesh.castShadow = true;
      group.add(leafMesh);

      // Leaf axil: small stub cylinder connecting stem surface to petiole base
      // This makes the leaf visibly "attached" to the stem, not floating
      const stemRadius = (node.stemRadiusMm ?? 4) / 1000;
      const axilLen = Math.max(stemRadius * 1.2, 0.004); // extends from stem surface
      const axilGeo = new THREE.CylinderGeometry(
        0.0012 * node.leafSizeFactor, // tip (where petiole begins)
        0.0018 * node.leafSizeFactor, // base (at stem)
        axilLen,
        4,
      );
      axilGeo.rotateZ(-Math.PI / 2); // horizontal
      axilGeo.translate(axilLen / 2, 0, 0); // extend from origin outward
      const axilMesh = new THREE.Mesh(axilGeo, plantLeafMat);
      axilMesh.position.set(stemXOff, nodeY, stemZOff);
      // Orient to match leaf direction
      const qAxilYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), yaw,
      );
      axilMesh.quaternion.copy(qAxilYaw);
      if (emScale < 1) axilMesh.scale.setScalar(emScale);
      group.add(axilMesh);

      // Truss (if present, opposite side from leaf)
      if (node.truss) {
        const trussDir = new THREE.Vector3(-leafDirX, 0, -leafDirZ).normalize();
        const trussGroup = generateTruss(
          node.truss,
          trussDir,
          nodeRng.fork(50),
          this.genome ?? undefined,
        );
        trussGroup.position.set(stemXOff, nodeY, stemZOff);
        group.add(trussGroup);
      }
    }

    return group;
  }

  private createCotyledons(state: PlantState, rng: SeededRandom): THREE.Group {
    const group = new THREE.Group();
    const size = 0.015 * state.cotyledonSize;
    const y = state.nodes.length > 0 ? (state.nodes[0].heightCm / 100) * 0.3 : 0.03;

    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(size * 2, size);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x4aaa30,
        roughness: 0.8,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(side * size, y, 0);
      mesh.rotation.set(-0.3 * side, side * 0.5, 0);
      group.add(mesh);
    }

    return group;
  }
}
