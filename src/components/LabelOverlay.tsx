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

  return (
    <>
      {labels.filter((l) => l.visible).map((l) => (
        <div
          key={l.id}
          style={{
            position: 'absolute',
            left: l.sx,
            top: l.sy,
            transform: 'translate3d(-50%, -120%, 0)',
            background: 'rgba(26,29,35,0.85)',
            color: l.color ?? '#e0e0e0',
            border: `1px solid ${l.color ?? '#3a3e46'}55`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 10,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(4px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            zIndex: 7,
          }}
        >
          {l.text}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '100%',
              transform: 'translate(-50%, -1px)',
              width: 1,
              height: 12,
              background: l.color ?? '#3a3e46',
              opacity: 0.6,
            }}
          />
        </div>
      ))}
    </>
  );
}
