import { GrowthController } from '../simulation/GrowthController';

export function setupTimeline(controller: GrowthController): void {
  const playBtn = document.getElementById('play-btn')!;
  const resetBtn = document.getElementById('reset-btn')!;
  const scrubber = document.getElementById('scrubber') as HTMLInputElement;
  const speedBtn = document.getElementById('speed-btn')!;

  const speeds = [0.5, 1, 2, 4];
  let speedIndex = 1;

  playBtn.addEventListener('click', () => {
    if (controller.currentDay >= 120) {
      controller.currentDay = 0;
    }
    controller.isPlaying = !controller.isPlaying;
    playBtn.innerHTML = controller.isPlaying ? '&#10074;&#10074;' : '&#9654;';
  });

  resetBtn.addEventListener('click', () => {
    controller.currentDay = 0;
    controller.isPlaying = false;
    playBtn.innerHTML = '&#9654;';
    controller.rebuildPlants();
  });

  scrubber.addEventListener('input', () => {
    controller.currentDay = parseFloat(scrubber.value);
    controller.isPlaying = false;
    playBtn.innerHTML = '&#9654;';
    controller.rebuildPlants();
  });

  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % speeds.length;
    controller.playbackSpeed = speeds[speedIndex];
    speedBtn.textContent = `${speeds[speedIndex]}x`;
  });
}
