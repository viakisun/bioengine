import { useEffect, useState, useRef } from 'react';

export interface LabelSpec {
  id: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  text: string;
  color?: string;
}

export interface LabelOverlayHandle {
  /** Replace the active label set. */
  setLabels: (labels: LabelSpec[]) => void;
  /** Pump 3D-world → 2D-screen positions. Call from render loop. */
  project: (project: (x: number, y: number, z: number) => { x: number; y: number; depth: number } | null) => void;
}

let _handle: LabelOverlayHandle | null = null;

export function getLabelOverlayHandle(): LabelOverlayHandle | null {
  return _handle;
}

interface ScreenLabel extends LabelSpec {
  sx: number;
  sy: number;
  visible: boolean;
}

export function LabelOverlay() {
  const [labels, setLabels] = useState<ScreenLabel[]>([]);
  const sourceRef = useRef<LabelSpec[]>([]);

  useEffect(() => {
    _handle = {
      setLabels(newLabels) {
        sourceRef.current = newLabels;
      },
      project(project) {
        const out: ScreenLabel[] = [];
        for (const l of sourceRef.current) {
          const p = project(l.worldX, l.worldY, l.worldZ);
          if (!p || p.depth < 0 || p.depth > 1) {
            out.push({ ...l, sx: 0, sy: 0, visible: false });
            continue;
          }
          out.push({ ...l, sx: p.x, sy: p.y, visible: true });
        }
        setLabels(out);
      },
    };
    return () => {
      _handle = null;
    };
  }, []);

  // Reference pattern: a single focus label rides above the showcase
  // plant (or whichever element the engine pushes first). Earlier the
  // overlay rendered every label (robot + showcase + 30 supporting),
  // which read as visual noise. Picking only the first visible label
  // matches the screenshot's clean "one tag, one leader line" look.
  const focus = labels.find((l) => l.visible);

  return (
    <>
      {focus && (
        <div
          key={focus.id}
          className="scene-label mono"
          style={{
            position: 'absolute',
            left: focus.sx,
            top: focus.sy,
            transform: 'translate3d(-50%, -140%, 0)',
            pointerEvents: 'none',
            zIndex: 7,
            whiteSpace: 'nowrap',
          }}
        >
          {focus.text}
        </div>
      )}
    </>
  );
}
