import { useEffect, useRef } from 'react';
import { createBabylonEngine, type BabylonEngineHandle } from '../twin/BabylonEngine';
import { notify } from '../store/notify';

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
        console.error('[SceneCanvas] engine create failed:', err);
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

  return (
    <canvas ref={canvasRef} className="canvas-fill" />
  );
}
