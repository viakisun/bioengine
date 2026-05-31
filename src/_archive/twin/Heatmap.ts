import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { SCENARIO, HEALTH_COLORS, zoneHealthMix, type HealthLabel } from '../data/mockScenario';
import { SUBSTRATE_TOP_Y } from './CocopeatBags';

export interface HeatmapHandle {
  mesh: Mesh;
  update: (day: number) => void;
  setVisible: (v: boolean) => void;
  setHoveredZone: (zoneId: number | null) => void;
  setSelectedZone: (zoneId: number | null) => void;
  /** Release texture / material / mesh. After dispose 다른 메서드 호출 금지. */
  dispose: () => void;
}

const TEX_WIDTH = 256;
const TEX_HEIGHT = 16;

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [
    parseInt(m.substring(0, 2), 16),
    parseInt(m.substring(2, 4), 16),
    parseInt(m.substring(4, 6), 16),
  ];
}

export function createHeatmap(scene: Scene): HeatmapHandle {
  const mesh = MeshBuilder.CreateGround(
    'heatmap',
    { width: SCENARIO.bedLengthM, height: 0.9, subdivisions: 1 },
    scene
  );
  // Sit above the cocopeat substrate mounds (SUBSTRATE_TOP_Y ≈ 1.062)
  // by a small margin so the heatmap doesn't z-fight with the
  // bag/mound geometry.
  mesh.position = new Vector3(0, SUBSTRATE_TOP_Y + 0.022, 0.5);
  mesh.isPickable = true;

  const data = new Uint8Array(TEX_WIDTH * TEX_HEIGHT * 4);
  const tex = new RawTexture(
    data,
    TEX_WIDTH,
    TEX_HEIGHT,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  );
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  tex.gammaSpace = true;

  const mat = new PBRMaterial('heatmapMat', scene);
  mat.albedoColor = new Color3(1, 1, 1);
  mat.albedoTexture = tex;
  mat.emissiveTexture = tex;
  // Reduced emissive + alpha — earlier values made the heatmap read as
  // bright pink/red rectangles on the light-theme background. 0.35
  // emissive + 0.32 alpha keeps the zone color readable but lets the
  // bed texture and plant shadows show through.
  mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
  mat.metallic = 0;
  mat.roughness = 0.6;
  mat.backFaceCulling = false;
  mat.alpha = 0.32;
  mat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  mesh.material = mat;

  let hoveredZone: number | null = null;
  let selectedZone: number | null = null;

  function paint(day: number) {
    const zonesRgb: Array<[number, number, number]> = SCENARIO.zones.map((zone) => {
      const { dominant } = zoneHealthMix(zone, day);
      return hexToRgb(HEALTH_COLORS[dominant]);
    });

    for (let x = 0; x < TEX_WIDTH; x++) {
      const u = x / TEX_WIDTH;
      const zoneIndex = Math.min(SCENARIO.zoneCount - 1, Math.floor(u * SCENARIO.zoneCount));
      const zonePos = u * SCENARIO.zoneCount - zoneIndex;
      const [r, g, b] = zonesRgb[zoneIndex];

      const isHovered = zoneIndex === hoveredZone;
      const isSelected = zoneIndex === selectedZone;

      const edgeDist = Math.min(zonePos, 1 - zonePos);
      const borderFade = Math.max(0, 1 - Math.exp(-edgeDist * 30));

      let rOut = r * borderFade + 80 * (1 - borderFade);
      let gOut = g * borderFade + 80 * (1 - borderFade);
      let bOut = b * borderFade + 80 * (1 - borderFade);

      if (isSelected) {
        rOut = rOut * 0.5 + 255 * 0.5;
        gOut = gOut * 0.5 + 255 * 0.5;
        bOut = bOut * 0.5 + 255 * 0.5;
      } else if (isHovered) {
        rOut = rOut * 0.8 + 255 * 0.2;
        gOut = gOut * 0.8 + 255 * 0.2;
        bOut = bOut * 0.8 + 255 * 0.2;
      }

      for (let y = 0; y < TEX_HEIGHT; y++) {
        const idx = (y * TEX_WIDTH + x) * 4;
        data[idx + 0] = Math.min(255, Math.floor(rOut));
        data[idx + 1] = Math.min(255, Math.floor(gOut));
        data[idx + 2] = Math.min(255, Math.floor(bOut));
        data[idx + 3] = 255;
      }
    }
    tex.update(data);
  }

  paint(0);

  return {
    mesh,
    update(day) { paint(day); },
    setVisible(v) { mesh.setEnabled(v); },
    setHoveredZone(zoneId) {
      if (hoveredZone === zoneId) return;
      hoveredZone = zoneId;
    },
    setSelectedZone(zoneId) {
      if (selectedZone === zoneId) return;
      selectedZone = zoneId;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
      mesh.dispose(false, false);
    },
  };
}

export function xToZoneId(x: number): number | null {
  const half = SCENARIO.bedLengthM / 2;
  if (x < -half || x > half) return null;
  const u = (x + half) / SCENARIO.bedLengthM;
  return Math.min(SCENARIO.zoneCount - 1, Math.floor(u * SCENARIO.zoneCount));
}
