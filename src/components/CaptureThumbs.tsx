import type { CaptureSession, HealthLabel } from '../data/mockScenario';

interface Props {
  session: CaptureSession;
  healthLabel: HealthLabel;
  size?: number;
}

function rgbStyle(health: HealthLabel, size: number): React.CSSProperties {
  // Simulated leaf canopy thumbnail — color shifts by health
  const baseHex = health === 'normal'
    ? '#3a8a30'
    : health === 'weak'
      ? '#7a8a35'
      : health === 'disease'
        ? '#8a5520'
        : '#5a7a3a';
  const accent = health === 'disease' ? '#c83228' : '#a8c860';
  return {
    width: size,
    height: size,
    background: `
      radial-gradient(circle at 30% 30%, ${accent}55, transparent 35%),
      radial-gradient(circle at 70% 65%, ${accent}33, transparent 30%),
      radial-gradient(circle at 50% 80%, ${baseHex}, ${baseHex}cc)
    `,
    borderRadius: 4,
    border: '1px solid #2a2e36',
  };
}

function depthStyle(size: number): React.CSSProperties {
  // Depth heatmap — radial: near=warm, far=cool
  return {
    width: size,
    height: size,
    background: 'radial-gradient(circle at 50% 50%, #fbbf24 0%, #ef4444 20%, #a855f7 50%, #1e3a8a 100%)',
    borderRadius: 4,
    border: '1px solid #2a2e36',
  };
}

function maskStyle(health: HealthLabel, size: number): React.CSSProperties {
  // Segmentation: leaf=green, fruit=amber, stem=blue blobs
  const fruitColor = health === 'disease' ? '#ef4444' : '#fbbf24';
  return {
    width: size,
    height: size,
    background: `
      radial-gradient(circle at 25% 35%, ${fruitColor}cc 0 5%, transparent 7%),
      radial-gradient(circle at 55% 45%, ${fruitColor}cc 0 4%, transparent 6%),
      radial-gradient(circle at 70% 70%, ${fruitColor}cc 0 5%, transparent 7%),
      linear-gradient(60deg, transparent 45%, #60a5fa88 47%, #60a5fa88 53%, transparent 55%),
      radial-gradient(ellipse 60% 80% at 40% 50%, #6ee7b7aa, #6ee7b733 60%, transparent 80%)
    `,
    borderRadius: 4,
    border: '1px solid #2a2e36',
  };
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
    textAlign: 'center',
  };
}

export function CaptureThumbs({ session, healthLabel, size = 70 }: Props) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <div>
        <div style={rgbStyle(healthLabel, size)} title="RGB 카메라" />
        <div style={labelStyle()}>RGB</div>
      </div>
      <div>
        <div style={depthStyle(size)} title="Depth 카메라" />
        <div style={labelStyle()}>Depth</div>
      </div>
      <div>
        <div style={maskStyle(healthLabel, size)} title="AI 세그멘테이션" />
        <div style={labelStyle()}>Mask</div>
      </div>
    </div>
  );
}
