import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { xToZoneId } from './Heatmap';

export interface ZonePickerHandle {
  dispose: () => void;
}

export function attachZonePicker(
  scene: Scene,
  heatmapMesh: Mesh,
  onHover: (zoneId: number | null) => void,
  onClick: (zoneId: number | null) => void
): ZonePickerHandle {
  const observer = scene.onPointerObservable.add((pi) => {
    if (pi.type === PointerEventTypes.POINTERMOVE) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === heatmapMesh);
      if (pick?.hit && pick.pickedPoint) {
        const zoneId = xToZoneId(pick.pickedPoint.x);
        onHover(zoneId);
        scene.getEngine().getRenderingCanvas()!.style.cursor = zoneId !== null ? 'pointer' : '';
      } else {
        onHover(null);
        scene.getEngine().getRenderingCanvas()!.style.cursor = '';
      }
    } else if (pi.type === PointerEventTypes.POINTERTAP) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === heatmapMesh);
      if (pick?.hit && pick.pickedPoint) {
        const zoneId = xToZoneId(pick.pickedPoint.x);
        onClick(zoneId);
      }
    }
  });

  return {
    dispose() {
      if (observer) scene.onPointerObservable.remove(observer);
    },
  };
}
