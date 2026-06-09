// Babylon wrapper for the procedural leaf textures.
// Algorithm lives in @farmsim/tomato-geometry; this file owns Scene-keyed
// caching + RawTexture creation.

import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {
  buildLeafColorBytes,
  buildLeafNormalBytes,
  LEAF_TEX_SIZE,
} from '@farmsim/tomato-geometry';
import { loadOptionalTextureSlot } from '../TextureSlotLoader';

const cachedColorTex = new WeakMap<Scene, RawTexture>();
const cachedNormalTex = new WeakMap<Scene, RawTexture>();

export function getLeafColorTexture(scene: Scene): RawTexture {
  let tex = cachedColorTex.get(scene);
  if (!tex) {
    const data = buildLeafColorBytes(0);
    tex = new RawTexture(
      data,
      LEAF_TEX_SIZE,
      LEAF_TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    tex.name = 'leafColor';
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.gammaSpace = true;
    cachedColorTex.set(scene, tex);
  }
  return tex;
}

export function getLeafNormalTexture(scene: Scene): RawTexture {
  let tex = cachedNormalTex.get(scene);
  if (!tex) {
    const data = buildLeafNormalBytes();
    tex = new RawTexture(
      data,
      LEAF_TEX_SIZE,
      LEAF_TEX_SIZE,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE
    );
    tex.name = 'leafNormal';
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.gammaSpace = false;
    cachedNormalTex.set(scene, tex);
  }
  return tex;
}

export type LeafTextureVariant = 'young' | 'mature' | 'old' | 'back' | 'stressed';

const LEAF_TEXTURE_SLOT_BASE = '/textures/leaf';
const ENABLE_LEAF_ATLAS_ON_SURFACE_MESH = false;

const LEAF_EXTERNAL_SLOTS: Record<LeafTextureVariant, {
  albedo: string;
  normal: string;
  roughness: string;
  alpha: string;
}> = {
  young: {
    albedo: `${LEAF_TEXTURE_SLOT_BASE}/leaf_young_albedo.png`,
    normal: `${LEAF_TEXTURE_SLOT_BASE}/leaf_normal.png`,
    roughness: `${LEAF_TEXTURE_SLOT_BASE}/leaf_roughness.png`,
    alpha: `${LEAF_TEXTURE_SLOT_BASE}/leaf_alpha.png`,
  },
  mature: {
    albedo: `${LEAF_TEXTURE_SLOT_BASE}/leaf_mature_albedo.png`,
    normal: `${LEAF_TEXTURE_SLOT_BASE}/leaf_normal.png`,
    roughness: `${LEAF_TEXTURE_SLOT_BASE}/leaf_roughness.png`,
    alpha: `${LEAF_TEXTURE_SLOT_BASE}/leaf_alpha.png`,
  },
  old: {
    albedo: `${LEAF_TEXTURE_SLOT_BASE}/leaf_old_albedo.png`,
    normal: `${LEAF_TEXTURE_SLOT_BASE}/leaf_normal.png`,
    roughness: `${LEAF_TEXTURE_SLOT_BASE}/leaf_roughness.png`,
    alpha: `${LEAF_TEXTURE_SLOT_BASE}/leaf_alpha.png`,
  },
  back: {
    albedo: `${LEAF_TEXTURE_SLOT_BASE}/leaf_back_albedo.png`,
    normal: `${LEAF_TEXTURE_SLOT_BASE}/leaf_back_normal.png`,
    roughness: `${LEAF_TEXTURE_SLOT_BASE}/leaf_roughness.png`,
    alpha: `${LEAF_TEXTURE_SLOT_BASE}/leaf_alpha.png`,
  },
  stressed: {
    albedo: `${LEAF_TEXTURE_SLOT_BASE}/leaf_stressed_albedo.png`,
    normal: `${LEAF_TEXTURE_SLOT_BASE}/leaf_normal.png`,
    roughness: `${LEAF_TEXTURE_SLOT_BASE}/leaf_roughness.png`,
    alpha: `${LEAF_TEXTURE_SLOT_BASE}/leaf_alpha.png`,
  },
};

export function attachExternalLeafTextureSlots(
  mat: PBRMaterial,
  scene: Scene,
  variant: LeafTextureVariant,
): void {
  const slots = LEAF_EXTERNAL_SLOTS[variant] ?? LEAF_EXTERNAL_SLOTS.mature;
  void mat;
  void scene;

  // CGBookcase Tomato Leaf 01 is an alpha atlas: a whole photographed leaf on
  // a dark background. The current tomato leaf renderer already builds cut
  // leaflet geometry and maps UVs across each leaflet surface. Applying this
  // atlas directly to those UVs stamps the full leaf silhouette and dark
  // background onto every leaflet. Keep the files documented for the future
  // alpha-card/atlas path, but do not bind them to the surface mesh in Phase 1.
  if (!ENABLE_LEAF_ATLAS_ON_SURFACE_MESH) {
    void slots;
    return;
  }

  loadOptionalTextureSlot(scene, slots.albedo, {
    gammaSpace: true,
    wrapU: Texture.CLAMP_ADDRESSMODE,
    wrapV: Texture.CLAMP_ADDRESSMODE,
    anisotropicFilteringLevel: 8,
  }).then((tex) => {
    if (tex) mat.albedoTexture = tex;
  });

  loadOptionalTextureSlot(scene, slots.normal, {
    gammaSpace: false,
    wrapU: Texture.CLAMP_ADDRESSMODE,
    wrapV: Texture.CLAMP_ADDRESSMODE,
    anisotropicFilteringLevel: 8,
  }).then((tex) => {
    if (tex) {
      mat.bumpTexture = tex;
      // CGBookcase Tomato Leaf maps are DirectX normals. Babylon's existing
      // procedural normal fallback stays OpenGL-style (invertNormalMapY=false)
      // until this external slot successfully loads.
      mat.invertNormalMapY = true;
      mat.invertNormalMapX = false;
    }
  });

  loadOptionalTextureSlot(scene, slots.roughness, {
    gammaSpace: false,
    wrapU: Texture.CLAMP_ADDRESSMODE,
    wrapV: Texture.CLAMP_ADDRESSMODE,
    anisotropicFilteringLevel: 8,
  }).then((tex) => {
    if (tex) {
      mat.metallicTexture = tex;
      mat.useRoughnessFromMetallicTextureAlpha = false;
      mat.useRoughnessFromMetallicTextureGreen = true;
      mat.useMetallnessFromMetallicTextureBlue = false;
      mat.metallic = 0;
    }
  });

  // Phase 1 keeps alpha as a documented slot only. We intentionally do
  // not enable alpha clipping yet to avoid sorting/overdraw/shadow artifacts.
  void slots.alpha;
}
