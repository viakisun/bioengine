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

// Add plants at each position with unique seeds
const baseSeed = 42;
for (let i = 0; i < plantPositions.length; i++) {
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
