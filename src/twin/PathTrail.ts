import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { SCENARIO } from '../data/mockScenario';

export interface PathTrailHandle {
  mesh: Mesh;
  update: (day: number) => void;
  setVisible: (v: boolean) => void;
  /** Lines mesh 해제. After dispose 호출 금지. */
  dispose: () => void;
}

export function createPathTrail(scene: Scene): PathTrailHandle {
  let mesh: Mesh | null = null;

  function rebuild(day: number) {
    const visibleKfs = SCENARIO.robotRoute.filter((kf) => kf.time <= day && kf.time >= day - 3);
    if (visibleKfs.length < 2) {
      if (mesh) {
        mesh.dispose();
        mesh = null;
      }
      mesh = MeshBuilder.CreateLines('pathTrailEmpty', {
        points: [new Vector3(0, 0.06, 1.5), new Vector3(0.001, 0.06, 1.5)],
      }, scene);
      return;
    }

    const points = visibleKfs.map((kf) => new Vector3(kf.position[0], 0.06, kf.position[2]));
    const colors: Color4[] = visibleKfs.map((kf) => {
      const age = day - kf.time;
      const alpha = Math.max(0.05, 1 - age / 3);
      const c = kf.task === 'capturing' ? new Color3(0.98, 0.75, 0.14) : new Color3(0.43, 0.91, 0.72);
      return new Color4(c.r, c.g, c.b, alpha);
    });

    if (mesh) mesh.dispose();
    mesh = MeshBuilder.CreateLines('pathTrail', { points, colors, useVertexAlpha: true }, scene);
    mesh.isPickable = false;
  }

  rebuild(0);

  return {
    get mesh() { return mesh!; },
    update(day) { rebuild(day); },
    setVisible(v) {
      if (mesh) mesh.setEnabled(v);
    },
    dispose() {
      if (mesh) {
        mesh.dispose();
        mesh = null;
      }
    },
  } as PathTrailHandle;
}
