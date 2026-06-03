// Babylon wrapper for the procedural leaf textures.
// Algorithm lives in @farmsim/tomato-geometry; this file owns Scene-keyed
// caching + RawTexture creation.

import { Scene } from '@babylonjs/core/scene';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Constants } from '@babylonjs/core/Engines/constants';
import {
  buildLeafColorBytes,
  buildLeafNormalBytes,
  LEAF_TEX_SIZE,
} from '@farmsim/tomato-geometry';

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
