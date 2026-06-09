import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

interface TextureSlotOptions {
  gammaSpace?: boolean;
  invertY?: boolean;
  samplingMode?: number;
  wrapU?: number;
  wrapV?: number;
  anisotropicFilteringLevel?: number;
}

const textureSlotCache = new WeakMap<Scene, Map<string, Promise<Texture | null>>>();

function sceneCache(scene: Scene): Map<string, Promise<Texture | null>> {
  let cache = textureSlotCache.get(scene);
  if (!cache) {
    cache = new Map();
    textureSlotCache.set(scene, cache);
  }
  return cache;
}

/**
 * Optional runtime texture slot.
 *
 * Materials start with procedural/scalar fallbacks. If a licensed external
 * texture exists under public/textures, this helper swaps it in after a cheap
 * existence check. Missing assets stay silent, so phase-1 can ship the slots
 * before final PBR files are committed.
 */
export function loadOptionalTextureSlot(
  scene: Scene,
  url: string | undefined,
  options: TextureSlotOptions = {},
): Promise<Texture | null> {
  if (!url || typeof fetch === 'undefined') return Promise.resolve(null);
  const cache = sceneCache(scene);
  const cacheKey = `${url}|${options.gammaSpace ? 'g' : 'l'}|${options.invertY ? 'iy' : 'n'}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = fetch(url, { method: 'HEAD' })
    .then((res) => {
      if (!res.ok) return null;
      return new Promise<Texture | null>((resolve) => {
        const tex = new Texture(
          url,
          scene,
          false,
          options.invertY ?? false,
          options.samplingMode ?? Texture.TRILINEAR_SAMPLINGMODE,
          () => resolve(tex),
          () => {
            tex.dispose();
            resolve(null);
          },
        );
        tex.gammaSpace = options.gammaSpace ?? true;
        if (options.wrapU !== undefined) tex.wrapU = options.wrapU;
        if (options.wrapV !== undefined) tex.wrapV = options.wrapV;
        if (options.anisotropicFilteringLevel !== undefined) {
          tex.anisotropicFilteringLevel = options.anisotropicFilteringLevel;
        }
      });
    })
    .catch(() => null);

  cache.set(cacheKey, promise);
  return promise;
}
