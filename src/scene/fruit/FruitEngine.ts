// ★ Iter 39 Phase L7-A-4 (S65) — FruitEngine namespace API (LeafEngine analog).
//
// 책임 (원칙 #42, #50):
//   src/scene/fruit/ = engine (plant-agnostic 산식, 'tomato' 단어 0)
//   src/data/fruit/  = data (botanical JSON + registry)
//
// 사용자 v3 sketch (data-driven API):
//   const spec = getFruitSpec('tomato.json');
//   const fruitNode = FruitEngine.createFruit(spec, name, scene, fruit, rng, opts);
//
// FruitEngine은 _spec을 받아 fruit mesh + material을 만드는_ 책임만. plant
// identifier ('tomato.json')는 caller 선택, engine 코드 안 'tomato' 0.

import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { SeededRandom, FruitState } from '@farmsim/tomato-engine';
import { createFruitNode } from './FruitGenerator';
import type { FruitSpec } from './FruitSpec';

/**
 * Options for {@link FruitEngine.createFruit}.
 */
export interface CreateFruitOptions {
  /** Mesh resolution. Default 'high'. */
  lod?: 'high' | 'low' | 'ultraLow';
  /** Skip calyx + stem stub (caller draws them via TrussGenerator). */
  skipCalyxAndStem?: boolean;
}

/**
 * Plant-agnostic fruit mesh engine.
 *
 * Single source of truth for fruit mesh + material generation. spec parameter
 * injection for botanical/rendering data (engine layer purity, 원칙 #42).
 */
export const FruitEngine = {
  /**
   * Create fruit TransformNode (body + optionally calyx + stem stub).
   *
   * @param spec    FruitSpec — loaded via `getFruitSpec(name)` from src/data/fruit.
   * @param name    mesh name prefix
   * @param scene   Babylon scene
   * @param fruit   FruitState (per-fruit physiology + cultivar genome embedded)
   * @param rng     SeededRandom (legacy, kept for compatibility)
   * @param options lod / skipCalyxAndStem
   */
  createFruit(
    spec: FruitSpec,
    name: string,
    scene: Scene,
    fruit: FruitState,
    rng: SeededRandom,
    options?: CreateFruitOptions,
  ): TransformNode {
    return createFruitNode(name, scene, fruit, rng, spec, options);
  },
};
