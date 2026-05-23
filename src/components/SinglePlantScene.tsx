// SinglePlantScene — the <canvas> host for the single-plant analysis
// mode. Owns the SinglePlantEngine lifecycle and the per-minute
// simulation loop. Reads scrub position + playback state from the store,
// drives the engine's diurnal lighting + the ShowcasePlant rebuild.

import { useEffect, useRef } from 'react';
import { useTwinStore } from '../store/twinStore';
import { createSinglePlantEngine, type SinglePlantEngineHandle } from '../twin/SinglePlantEngine';
import { setSinglePlantEngineRef } from '../ui/single-plant/useSinglePlantState';
import { setBootStage, logBoot } from '../store/notify';

const PLANT_SEED = 1001;

export function SinglePlantScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SinglePlantEngineHandle | null>(null);

  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const speed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const camera = useTwinStore((s) => s.singlePlantCamera);

  // Mount the engine once
  useEffect(() => {
    if (!canvasRef.current) return;
    setBootStage('engine', '단일 식물 씬 부팅', 0.1);
    logBoot('log', 'single-plant: 엔진 생성');
    handleRef.current = createSinglePlantEngine(canvasRef.current);
    setSinglePlantEngineRef(handleRef.current.growthEngine);
    setBootStage('plants', '식물 메쉬 빌드', 0.5);
    logBoot('log', 'single-plant: Showcase plant 등록');
    // First simulation + visual rebuild
    handleRef.current.growthEngine.simulatePlantToMinute(
      PLANT_SEED,
      useTwinStore.getState().singlePlantMinute,
    );
    const day = Math.floor(useTwinStore.getState().singlePlantMinute / 1440);
    handleRef.current.plant.update(day);
    // Tell BootOverlay we're done — the scene is alive.
    setBootStage('ready', '준비 완료', 1);
    logBoot('log', 'single-plant: ready');
    return () => {
      setSinglePlantEngineRef(null);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  // Drive the engine on every scrub change
  useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    // Simulate the plant's physiology state up to the scrub position
    h.growthEngine.simulatePlantToMinute(PLANT_SEED, minute);
    // Sun position follows the fractional hour of the day
    const fracHour = (minute % 1440) / 60;
    h.setHour(fracHour);
    // The ShowcasePlant update reads currentDay from the store, which
    // we keep in sync via day = floor(minute / 1440)
    const day = Math.floor(minute / 1440);
    h.plant.update(day);
  }, [minute]);

  // Camera preset
  useEffect(() => {
    handleRef.current?.setCamera(camera);
  }, [camera]);

  // Playback loop — rAF, scales minute by speed × elapsed
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000; // seconds
      last = now;
      // speed × 1 min per real-time second
      const advanceMinutes = dt * speed;
      const cur = useTwinStore.getState().singlePlantMinute;
      const next = cur + advanceMinutes;
      if (next >= 120 * 24 * 60) {
        // End of simulation — pause and clamp
        useTwinStore.getState().setSinglePlantPlaying(false);
        setMinute(120 * 24 * 60 - 1);
        return;
      }
      setMinute(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, speed, setMinute]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        outline: 'none',
      }}
    />
  );
}
