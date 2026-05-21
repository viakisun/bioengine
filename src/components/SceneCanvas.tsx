import { useEffect, useRef } from 'react';
import { createBabylonEngine, type BabylonEngineHandle } from '../twin/BabylonEngine';

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
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        outline: 'none',
        touchAction: 'none',
      }}
    />
  );
}
