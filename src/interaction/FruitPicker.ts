import * as THREE from 'three';

export interface FruitInfo {
  type: string;
  ripenStage: number;
  diameterMm: number;
  isHarvestable: boolean;
  worldPosition: THREE.Vector3;
}

const RIPEN_LABELS = ['녹숙기', '변색기', '채색기', '도색기', '담적색기', '완숙기'];

export class FruitPicker {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private camera: THREE.Camera;
  private scene: THREE.Scene;
  private canvas: HTMLCanvasElement;
  private tooltip: HTMLElement;
  private highlight: THREE.Mesh | null = null;
  private highlightMat: THREE.MeshBasicMaterial;
  private selectedMesh: THREE.Mesh | null = null;

  constructor(camera: THREE.Camera, scene: THREE.Scene, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.scene = scene;
    this.canvas = canvas;

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'fruit-tooltip';
    this.tooltip.style.cssText = `
      position: absolute;
      display: none;
      background: rgba(20, 24, 30, 0.92);
      border: 1px solid #6ee7b7;
      border-radius: 8px;
      padding: 10px 14px;
      color: #e0e0e0;
      font-size: 12px;
      line-height: 1.6;
      pointer-events: none;
      z-index: 100;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      max-width: 220px;
    `;
    document.getElementById('canvas-wrap')!.appendChild(this.tooltip);

    // Highlight ring material
    this.highlightMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    // Event listeners (click only — mousemove raycasting is too expensive with 5000+ meshes)
    canvas.addEventListener('click', this.onClick);
  }

  private onClick = (e: MouseEvent): void => {
    this.updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const plantContainer = this.scene.getObjectByName('plants');
    if (!plantContainer) return;

    const intersects = this.raycaster.intersectObjects(plantContainer.children, true);

    // Find first fruit hit
    let fruitMesh: THREE.Mesh | null = null;
    for (const hit of intersects) {
      if (hit.object instanceof THREE.Mesh && hit.object.userData?.type === 'fruit') {
        fruitMesh = hit.object;
        break;
      }
    }

    this.clearHighlight();

    if (fruitMesh) {
      this.selectedMesh = fruitMesh;
      this.showHighlight(fruitMesh);
      this.showTooltip(fruitMesh, e);
      this.logFruitInfo(fruitMesh);
    } else {
      this.selectedMesh = null;
      this.tooltip.style.display = 'none';
    }
  };

  private updateMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private showHighlight(mesh: THREE.Mesh): void {
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    const worldScale = new THREE.Vector3();
    mesh.getWorldScale(worldScale);
    const radius = worldScale.x; // fruit is uniformly scaled

    // Glowing sphere around fruit
    const sphereGeo = new THREE.SphereGeometry(radius * 2.0, 16, 12);
    this.highlight = new THREE.Mesh(sphereGeo, this.highlightMat);
    this.highlight.position.copy(worldPos);
    this.highlight.renderOrder = 999;
    this.scene.add(this.highlight);
  }

  private clearHighlight(): void {
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
  }

  private showTooltip(mesh: THREE.Mesh, e: MouseEvent): void {
    const data = mesh.userData;
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const stageLabel = RIPEN_LABELS[data.ripenStage] ?? `Stage ${data.ripenStage}`;
    const harvestIcon = data.isHarvestable ? '🟢' : '⚪';

    this.tooltip.innerHTML = `
      <div style="font-weight:600; color:#6ee7b7; margin-bottom:4px;">과실 정보</div>
      <div>숙성: <strong>${stageLabel}</strong></div>
      <div>직경: <strong>${data.diameterMm.toFixed(1)} mm</strong></div>
      <div>수확가능: ${harvestIcon} ${data.isHarvestable ? '예' : '아니오'}</div>
      <div style="font-size:10px; color:#6b7280; margin-top:4px;">
        위치: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})
      </div>
    `;

    const rect = this.canvas.getBoundingClientRect();
    const tx = e.clientX - rect.left + 16;
    const ty = e.clientY - rect.top - 10;
    this.tooltip.style.left = `${tx}px`;
    this.tooltip.style.top = `${ty}px`;
    this.tooltip.style.display = 'block';
  }

  private logFruitInfo(mesh: THREE.Mesh): void {
    const data = mesh.userData;
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    console.log('[FruitPicker] Selected fruit:', {
      ripenStage: data.ripenStage,
      ripenName: RIPEN_LABELS[data.ripenStage],
      diameterMm: data.diameterMm,
      isHarvestable: data.isHarvestable,
      worldPosition: {
        x: worldPos.x.toFixed(4),
        y: worldPos.y.toFixed(4),
        z: worldPos.z.toFixed(4),
      },
    });
  }

  /** Call on plant rebuild to clear stale highlight */
  onPlantsRebuilt(): void {
    this.clearHighlight();
    this.selectedMesh = null;
    this.tooltip.style.display = 'none';
  }

  dispose(): void {
    this.canvas.removeEventListener('click', this.onClick);
    this.clearHighlight();
    this.highlightMat.dispose();
    this.tooltip.remove();
  }
}
