import * as THREE from 'three';
import { TOTAL_DAYS, RIPEN_NAMES, STAGE_COLORS, type PlantState } from './GrowthModel';
import { GrowthEngine } from './GrowthEngine';
import { PlantGenerator } from '../generators/PlantGenerator';
import type { LightingSystem } from '../environment/Lighting';

const TOTAL_DURATION = 120; // seconds for full cycle
const FULL_DETAIL_DISTANCE = 5;
const MEDIUM_DETAIL_DISTANCE = 12;
const SIMPLE_DETAIL_DISTANCE = 25;

export class GrowthController {
  currentDay = 0;
  isPlaying = true;
  playbackSpeed = 1;
  camera: THREE.Camera | null = null;
  onRebuild: (() => void) | null = null;
  lighting: LightingSystem | null = null;

  readonly engine: GrowthEngine;

  private lastStageName = '';
  private lastBuiltDay = -1;

  private plants: Array<{
    generator: PlantGenerator;
    group: THREE.Group;
    position: THREE.Vector3;
    seed: number;
    lod: 'full' | 'simple' | 'none';
  }> = [];

  private scene: THREE.Scene;
  private plantContainer: THREE.Group;
  private stageOverlay: HTMLElement | null;
  private stageTimeout: ReturnType<typeof setTimeout> | null = null;

  // Reusable LOD geometries
  private simpleStemGeo: THREE.CylinderGeometry | null = null;
  private simpleFruitGeo: THREE.SphereGeometry | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.engine = new GrowthEngine();
    this.plantContainer = new THREE.Group();
    this.plantContainer.name = 'plants';
    this.scene.add(this.plantContainer);
    this.stageOverlay = document.getElementById('stage-overlay');
  }

  addPlant(seed: number, position: THREE.Vector3): void {
    const genome = this.engine.addPlant(seed);
    const generator = new PlantGenerator(seed);
    generator.genome = genome;
    this.plants.push({
      generator,
      group: new THREE.Group(),
      position,
      seed,
      lod: 'none',
    });
  }

  get plantCount(): number {
    return this.plants.length;
  }

  rebuildPlants(): void {
    // Clear old
    while (this.plantContainer.children.length > 0) {
      const child = this.plantContainer.children[0];
      this.plantContainer.remove(child);
      disposeObject(child);
    }

    const cameraPos = this.camera?.position ?? new THREE.Vector3(2, 1.8, 3);

    // Aggregate stats for UI
    let totalLeaves = 0;
    let totalTrusses = 0;
    let totalFruits = 0;
    let maxRipen = -1;
    let representativeState: PlantState | null = null;

    for (const plant of this.plants) {
      // Per-plant state from engine (includes plantingDayOffset)
      const state = this.engine.computeState(plant.seed, this.currentDay);

      if (!representativeState) representativeState = state;

      totalLeaves += state.leafCount;
      totalTrusses += state.trussCount;
      totalFruits += state.totalFruits;
      if (state.maxRipenStage > maxRipen) maxRipen = state.maxRipenStage;

      const dist = cameraPos.distanceTo(plant.position);

      let plantGroup: THREE.Group;

      if (dist < FULL_DETAIL_DISTANCE) {
        plantGroup = plant.generator.generate(state);
        plant.lod = 'full';
      } else if (dist < MEDIUM_DETAIL_DISTANCE) {
        plantGroup = this.createMediumPlant(state, plant.seed, plant.generator);
        plant.lod = 'full';
      } else if (dist < SIMPLE_DETAIL_DISTANCE) {
        plantGroup = this.createSimplePlant(state, plant.seed);
        plant.lod = 'simple';
      } else {
        plantGroup = this.createUltraSimplePlant(state);
        plant.lod = 'none';
      }

      plantGroup.position.copy(plant.position);
      this.plantContainer.add(plantGroup);
      plant.group = plantGroup;
    }

    this.lastBuiltDay = Math.floor(this.currentDay);
    this.onRebuild?.();
    this.updateUI(representativeState, totalLeaves, totalTrusses, totalFruits, maxRipen);
  }

  // Shared materials for LOD plants (created once)
  private medLeafMat: THREE.MeshStandardMaterial | null = null;
  private medStemMat: THREE.MeshStandardMaterial | null = null;
  private medPetioleMat: THREE.MeshStandardMaterial | null = null;
  private medPedicelMat: THREE.MeshStandardMaterial | null = null;
  private medLeafletGeo: THREE.BufferGeometry | null = null;

  private ensureLodMaterials(): void {
    if (this.medLeafMat) return;
    this.medLeafMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a25, roughness: 0.65, side: THREE.DoubleSide,
    });
    this.medStemMat = new THREE.MeshStandardMaterial({ color: 0x3a7030, roughness: 0.7 });
    this.medPetioleMat = new THREE.MeshStandardMaterial({ color: 0x4a8a30, roughness: 0.8 });
    this.medPedicelMat = new THREE.MeshStandardMaterial({ color: 0x5a9a40, roughness: 0.8 });
  }

  // Medium LOD: compound leaf canopy with 3 overlapping ovate shapes per leaf + truss branches
  private createMediumPlant(state: PlantState, _seed: number, _generator: PlantGenerator): THREE.Group {
    this.ensureLodMaterials();
    const group = new THREE.Group();
    const heightM = state.heightCm / 100;
    if (heightM < 0.01) return group;

    // Stem: tapered cylinder — real tomato: 10-16mm diameter at base, ~4mm at tip
    const baseRadius = Math.min(0.012, 0.002 + heightM * 0.005);
    const tipRadius = 0.002;
    const stemGeo = new THREE.CylinderGeometry(tipRadius, baseRadius, heightM, 6);
    stemGeo.translate(0, heightM / 2, 0);
    const stem = new THREE.Mesh(stemGeo, this.medStemMat!);
    stem.castShadow = true;
    group.add(stem);

    // Compound leaves at each node — 3 ovate planes per leaf representing the canopy
    for (const node of state.nodes) {
      if (node.leafMaturity < 0.1) continue;

      const nodeY = node.heightCm / 100;
      const phyRad = node.phyllotaxisAngle * Math.PI / 180;
      const dirX = Math.cos(phyRad);
      const dirZ = Math.sin(phyRad);
      const emScale = node.emergence ?? 1;

      // Size varies by position: lower=large, upper=small
      const posT = nodeY / Math.max(heightM, 0.01);
      const sizeMod = node.leafSizeFactor * node.leafMaturity * emScale;
      const rachisLen = 0.28 * sizeMod * (0.6 + 0.4 * Math.sin(posT * Math.PI));
      if (rachisLen < 0.01) continue;

      // Match full-detail gravity droop: baseDroop + droopExtra * 0.9
      const medAgeFrac = Math.min(1, (node.age ?? 0) / 80);
      const droopAngle = (10 + medAgeFrac * 15 + node.droopExtra * 0.9) * Math.PI / 180;

      // 3 ovate leaflet shapes forming compound leaf silhouette
      // Geometry extends along +X, so yaw (Y rotation) aims it outward
      const leafSize = rachisLen * 0.85;

      // Terminal leaflet — at stem attachment point, aims outward along rachis
      this.addMediumLeaflet(group, 0, nodeY, 0, leafSize * 1.0, phyRad, droopAngle, 0);

      // Left and right lateral leaflets — angled to sides
      if (leafSize > 0.012) {
        for (const side of [-1, 1]) {
          this.addMediumLeaflet(
            group,
            0, nodeY, 0,
            leafSize * 0.7,
            phyRad + side * 0.6,     // splay outward
            droopAngle + 0.05,        // slightly more droop
            side * 0.25,              // slight roll
          );
        }
      }

      // Truss with branch structure (opposite side from leaf)
      if (node.truss && (node.truss.fruits.length > 0 || node.truss.flowers.length > 0)) {
        this.addMediumTruss(group, { truss: node.truss, phyllotaxisAngle: node.phyllotaxisAngle }, nodeY, -dirX, -dirZ);
      }
    }

    return group;
  }

  // Cached ovate leaflet geometry (unit size, scaled per instance)
  private ovateLeafletGeo: THREE.BufferGeometry | null = null;

  private getOvateLeafletGeo(): THREE.BufferGeometry {
    if (this.ovateLeafletGeo) return this.ovateLeafletGeo;
    // Unit-size ovate shape: extends along +X (length), width along Z, normal along Y
    // This way rotation.y (yaw) aims the leaf outward, rotation.x (pitch) droops it
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
      // base (at stem)
      0, 0, 0,
      // left edge points (along +X, spread in Z)
      0.1, 0.003, -0.15,
      0.4, 0.002, -0.25,
      0.7, -0.008, -0.18,
      // tip
      1.0, -0.015, 0,
      // right edge points
      0.7, -0.008, 0.18,
      0.4, 0.002, 0.25,
      0.1, 0.003, 0.15,
    ]);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex([0,1,2, 0,2,3, 0,3,4, 0,4,5, 0,5,6, 0,6,7, 0,7,1]);
    geo.computeVertexNormals();
    this.ovateLeafletGeo = geo;
    return geo;
  }

  // Add a single ovate leaflet mesh for medium LOD (uses cached geometry)
  private addMediumLeaflet(
    group: THREE.Group,
    x: number, y: number, z: number,
    size: number, yaw: number, pitch: number, roll: number,
  ): void {
    const mesh = new THREE.Mesh(this.getOvateLeafletGeo(), this.medLeafMat!);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(size);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(pitch, yaw, roll);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Add truss with peduncle branch and individual pedicels for fruits
  private addMediumTruss(
    group: THREE.Group,
    node: { truss: NonNullable<import('../simulation/GrowthModel').NodeState['truss']>; phyllotaxisAngle: number },
    nodeY: number,
    dirX: number, dirZ: number,
  ): void {
    const truss = node.truss;
    const totalItems = truss.flowers.length + truss.fruits.length;
    if (totalItems === 0) return;

    // Peduncle: branch from stem outward and droop
    const pedLen = 0.08;
    const fruitMass = truss.fruits.reduce((s, f) => s + f.diameterMm, 0) / 1000;
    const droop = 0.02 + fruitMass * 0.1;

    const pedEndX = dirX * pedLen;
    const pedEndZ = dirZ * pedLen;
    const pedEndY = nodeY - droop;

    // Peduncle as line (cheaper than TubeGeometry)
    const pedMid = new THREE.Vector3(
      dirX * pedLen * 0.5, nodeY - droop * 0.3, dirZ * pedLen * 0.5,
    );
    const pedEnd = new THREE.Vector3(pedEndX, pedEndY, pedEndZ);
    const pedGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, nodeY, 0), pedMid, pedEnd,
    ]);
    group.add(new THREE.Line(pedGeo, new THREE.LineBasicMaterial({ color: 0x4a8a30, linewidth: 2 })));

    // Use pedEnd for fruit positioning via simple interpolation
    const pedCurve = { getPoint: (t: number) => {
      if (t < 0.5) return new THREE.Vector3(0, nodeY, 0).lerp(pedMid, t * 2);
      return pedMid.clone().lerp(pedEnd, (t - 0.5) * 2);
    }};

    if (!this.simpleFruitGeo) {
      this.simpleFruitGeo = new THREE.SphereGeometry(1, 6, 4);
    }

    // Individual fruits on pedicels branching from peduncle
    truss.fruits.forEach((fruit, fi) => {
      const radiusM = (fruit.diameterMm / 2) / 1000;
      if (radiusM < 0.002) return;

      const t = 0.3 + 0.7 * ((fi + 0.5) / Math.max(1, totalItems));
      // Position along peduncle
      const pt = pedCurve.getPoint(t);

      // Pedicel: short branch from peduncle to fruit
      const pedicelLen = 0.02 + radiusM * 0.5;
      const pAngle = (fi * 2.4 + node.phyllotaxisAngle * 0.01);
      const pDirX = dirX * 0.5 + Math.cos(pAngle) * 0.5;
      const pDirZ = dirZ * 0.5 + Math.sin(pAngle) * 0.5;
      const gravity = radiusM * 0.6;

      const fruitPos = new THREE.Vector3(
        pt.x + pDirX * pedicelLen,
        pt.y - gravity,
        pt.z + pDirZ * pedicelLen,
      );

      // Pedicel line
      const pedicelGeo = new THREE.BufferGeometry().setFromPoints([pt, fruitPos]);
      const pedicelLine = new THREE.Line(
        pedicelGeo,
        new THREE.LineBasicMaterial({ color: 0x5a9a40 }),
      );
      group.add(pedicelLine);

      // Fruit sphere
      const c = fruit.color;
      const fMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255),
        roughness: 0.5,
      });
      const fMesh = new THREE.Mesh(this.simpleFruitGeo!, fMat);
      fMesh.position.copy(fruitPos);
      fMesh.scale.setScalar(radiusM);
      group.add(fMesh);
    });

    // Flowers as small yellow dots
    truss.flowers.forEach((flower, fi) => {
      const t = 0.5 + 0.5 * ((fi + 0.5) / Math.max(1, totalItems));
      const pt = pedCurve.getPoint(Math.min(t, 1));
      const fAngle = fi * 2.0 + 1.0;
      const flowerPos = new THREE.Vector3(
        pt.x + Math.cos(fAngle) * 0.015,
        pt.y - 0.005,
        pt.z + Math.sin(fAngle) * 0.015,
      );
      const flowerGeo = new THREE.SphereGeometry(0.004 * flower.bloomProgress, 4, 3);
      const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf0d040, roughness: 0.7 });
      const flowerMesh = new THREE.Mesh(flowerGeo, flowerMat);
      flowerMesh.position.copy(flowerPos);
      group.add(flowerMesh);
    });
  }

  // Simple LOD: compound leaf silhouette with crossed planes, truss clusters
  private createSimplePlant(state: PlantState, _seed: number): THREE.Group {
    this.ensureLodMaterials();
    const group = new THREE.Group();
    const heightM = state.heightCm / 100;
    if (heightM < 0.01) return group;

    // Stem — herbaceous vine proportions (real tomato: 10-16mm base diameter)
    const baseR = Math.min(0.008, 0.002 + heightM * 0.003);
    if (!this.simpleStemGeo) {
      this.simpleStemGeo = new THREE.CylinderGeometry(0.002, 0.005, 1, 4);
      this.simpleStemGeo.translate(0, 0.5, 0);
    }
    const stem = new THREE.Mesh(this.simpleStemGeo, this.medStemMat!);
    stem.scale.set(baseR / 0.005, heightM, baseR / 0.005);
    group.add(stem);

    // Compound leaf approximation: cross-shaped billboard (2 perpendicular planes)
    // each representing a compound leaf's spread
    const leafCount = Math.min(state.leafCount, 18);
    for (let i = 0; i < leafCount; i++) {
      const t = (i + 1) / (leafCount + 1);
      const angle = i * 137.508 * Math.PI / 180;
      const posT = t; // 0=bottom, 1=top
      const sizeMod = state.nodes[Math.min(i, state.nodes.length - 1)]?.leafSizeFactor ?? 0.5;
      const leafW = 0.18 * sizeMod;
      const leafH = 0.12 * sizeMod;
      const reach = 0.06 + sizeMod * 0.05;

      // Two perpendicular planes for 3D volume
      for (let p = 0; p < 2; p++) {
        const planeAngle = angle + p * Math.PI / 3;
        const geo = new THREE.PlaneGeometry(leafW, leafH);
        const mesh = new THREE.Mesh(geo, this.medLeafMat!);
        mesh.position.set(
          Math.cos(planeAngle) * reach,
          heightM * t,
          Math.sin(planeAngle) * reach,
        );
        mesh.rotation.order = 'YXZ';
        mesh.rotation.set(
          0.3 + posT * 0.15, // droop increases lower
          planeAngle,
          0,
        );
        mesh.castShadow = true;
        group.add(mesh);
      }
    }

    // Fruit clusters on short branches
    if (!this.simpleFruitGeo) {
      this.simpleFruitGeo = new THREE.SphereGeometry(1, 6, 4);
    }
    for (const node of state.nodes) {
      if (!node.truss) continue;
      const nodeY = node.heightCm / 100;
      const angle = node.phyllotaxisAngle * Math.PI / 180;
      const branchDirX = -Math.cos(angle);
      const branchDirZ = -Math.sin(angle);

      // Short peduncle line
      if (node.truss.fruits.length > 0) {
        const pedEnd = new THREE.Vector3(
          branchDirX * 0.05, nodeY - 0.02, branchDirZ * 0.05,
        );
        const pedGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, nodeY, 0), pedEnd,
        ]);
        group.add(new THREE.Line(pedGeo, new THREE.LineBasicMaterial({ color: 0x5a9a40 })));

        for (const fruit of node.truss.fruits) {
          const radiusM = (fruit.diameterMm / 2) / 1000;
          if (radiusM < 0.003) continue;
          const c = fruit.color;
          const fMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255),
            roughness: 0.5,
          });
          const fMesh = new THREE.Mesh(this.simpleFruitGeo, fMat);
          fMesh.position.copy(pedEnd);
          fMesh.position.y -= radiusM;
          fMesh.scale.setScalar(radiusM);
          group.add(fMesh);
        }
      }
    }

    return group;
  }

  private createUltraSimplePlant(state: PlantState): THREE.Group {
    const group = new THREE.Group();
    const heightM = state.heightCm / 100;
    if (heightM < 0.01) return group;

    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, heightM, 0)];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x3a7030 });
    group.add(new THREE.Line(geo, mat));

    if (state.maxRipenStage >= 0 && state.totalFruits > 0) {
      const c = STAGE_COLORS[state.maxRipenStage];
      const sphereGeo = new THREE.SphereGeometry(0.02, 4, 3);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255),
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.y = heightM * 0.4;
      group.add(sphere);
    }

    return group;
  }

  private windTime = 0;

  update(dt: number, _elapsed: number): void {
    this.windTime += dt;
    this.updateWindSway();

    // Update sun position based on simulation day
    this.lighting?.updateFromDay(this.currentDay);

    if (!this.isPlaying) return;

    const prevDay = this.currentDay;
    this.currentDay += (dt / TOTAL_DURATION) * TOTAL_DAYS * this.playbackSpeed;

    if (this.currentDay >= TOTAL_DAYS) {
      this.currentDay = TOTAL_DAYS;
      this.isPlaying = false;
      const btn = document.getElementById('play-btn');
      if (btn) btn.innerHTML = '&#9654;';
    }

    // Rebuild every ~1 sim day (more frequent for smoother growth)
    if (Math.floor(this.currentDay) !== Math.floor(prevDay) || prevDay === 0) {
      this.rebuildPlants();
    }
  }

  private updateWindSway(): void {
    const t = this.windTime;
    for (let i = 0; i < this.plants.length; i++) {
      const plant = this.plants[i];
      if (plant.lod !== 'full' && plant.lod !== 'simple') continue;

      const phase = plant.position.x * 1.7 + plant.position.z * 2.3;
      const swayX = Math.sin(t * 1.2 + phase) * 0.008 + Math.sin(t * 2.7 + phase * 0.6) * 0.004;
      const swayZ = Math.cos(t * 0.9 + phase * 1.3) * 0.006 + Math.cos(t * 2.1 + phase * 0.4) * 0.003;

      plant.group.rotation.x = swayX;
      plant.group.rotation.z = swayZ;
    }
  }

  private updateUI(
    state: PlantState | null,
    totalLeaves: number,
    totalTrusses: number,
    totalFruits: number,
    maxRipen: number,
  ): void {
    if (!state) return;

    const setText = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('v-stage', state.currentStage.name);
    setText('v-day', `${Math.floor(this.currentDay)} / ${TOTAL_DAYS}`);
    setText('v-height', `${state.heightCm.toFixed(1)} cm`);
    setText('v-leaves', `${totalLeaves}`);
    setText('v-trusses', `${totalTrusses}`);
    setText('v-fruits', `${totalFruits}`);
    setText('v-ripen', maxRipen >= 0 ? RIPEN_NAMES[maxRipen] : '-');

    const scrubber = document.getElementById('scrubber') as HTMLInputElement | null;
    if (scrubber) scrubber.value = String(this.currentDay);

    const plantCountEl = document.getElementById('plant-count');
    if (plantCountEl) plantCountEl.textContent = `${this.plants.length} plants`;

    if (state.currentStage.name !== this.lastStageName && state.day > 1) {
      this.lastStageName = state.currentStage.name;
      this.showStageOverlay(state.currentStage.name);
    }
  }

  private showStageOverlay(text: string): void {
    if (!this.stageOverlay) return;
    this.stageOverlay.textContent = text;
    this.stageOverlay.style.opacity = '1';
    if (this.stageTimeout) clearTimeout(this.stageTimeout);
    this.stageTimeout = setTimeout(() => {
      if (this.stageOverlay) this.stageOverlay.style.opacity = '0';
    }, 2000);
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  });
}
