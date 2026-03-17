import { Engine } from './core/Engine';
import { LightingSystem } from './environment/Lighting';
import { createGreenhouse } from './environment/Greenhouse';
import { createHangingBed, getPlantPositions } from './environment/HangingBed';
import { GrowthController } from './simulation/GrowthController';
import { setupTimeline } from './ui/Timeline';
import { FruitPicker } from './interaction/FruitPicker';

// Initialize engine
const engine = new Engine('sim-canvas');

// Setup environment
const lighting = new LightingSystem(engine.scene);
createGreenhouse(engine.scene);
const bedGroup = createHangingBed(engine.scene);

// Get plant positions along the 30m bed
const plantPositions = getPlantPositions(bedGroup);

// Growth controller
const growthController = new GrowthController(engine.scene);

// Add plants — limit to 10 plants for robot simulation performance
const MAX_PLANTS = 10;
const baseSeed = 42;
// Center the plants in the middle of the bed
const startIdx = Math.max(0, Math.floor((plantPositions.length - MAX_PLANTS) / 2));
const endIdx = Math.min(plantPositions.length, startIdx + MAX_PLANTS);
for (let i = startIdx; i < endIdx; i++) {
  growthController.addPlant(baseSeed + i * 7919, plantPositions[i]);
}

// Pass camera reference for LOD and lighting for sun updates
growthController.camera = engine.camera;
growthController.lighting = lighting;

// Register growth controller for updates
engine.addUpdatable(growthController);

// Setup UI timeline controls
setupTimeline(growthController);

// Fruit picking (robot harvest testing)
const fruitPicker = new FruitPicker(engine.camera, engine.scene, document.getElementById('sim-canvas') as HTMLCanvasElement);
growthController.onRebuild = () => fruitPicker.onPlantsRebuilt();

// Initial build
growthController.rebuildPlants();

// Focus camera on center of bed
engine.camera.position.set(2, 1.8, 3);
engine.controls.focusOnPlant(0, 1.0);

// Start render loop
engine.start();

console.log(`FarmSim 3D: ${growthController.plantCount} plants on 30m bed`);

// Debug: expose engine to console
(window as any).__engine = engine;
