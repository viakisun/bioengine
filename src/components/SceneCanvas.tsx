import { useEffect, useRef } from 'react';
import { createBabylonEngine, type BabylonEngineHandle } from '../twin/BabylonEngine';
import { notify } from '../store/notify';
import { createLogger } from '../utils/logger';
const log = createLogger('scene');

export function SceneCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<BabylonEngineHandle | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;

    createBabylonEngine(canvasRef.current)
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        if (import.meta.env.DEV) {
          window.__debugScene = handle.scene;
          window.__debugEngine = handle;
        }
      })
      .catch((err) => {
        log.error('engine create failed:', err);
        notify.error('엔진 초기화 실패', err instanceof Error ? err : String(err));
        const hud = document.getElementById('hud-backend');
        if (hud) hud.textContent = 'ENGINE ERROR — check console';
      });

    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  // Capture wheel + macOS trackpad pinch gestures over the canvas so they
  // drive the Babylon camera dolly only, never the browser's page zoom.
  // Babylon's own wheel handler still receives the event — preventDefault
  // blocks the browser default action, not propagation.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('gesturestart', onGesture, { passive: false });
    canvas.addEventListener('gesturechange', onGesture, { passive: false });
    canvas.addEventListener('gestureend', onGesture, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGesture);
      canvas.removeEventListener('gesturechange', onGesture);
      canvas.removeEventListener('gestureend', onGesture);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="canvas-fill" />
  );
}
