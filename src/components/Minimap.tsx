import { useEffect, useRef, useState } from 'react';
import { useTwinStore } from '../store/twinStore';
import { SCENARIO, HEALTH_COLORS, zoneHealthMix, getRobotStateAtDay } from '../data/mockScenario';

const W = 280;
const H = 110;
const PAD = 16;

export function Minimap() {
  const currentDay = useTwinStore((s) => s.currentDay);
  const selectedZoneId = useTwinStore((s) => s.selectedZoneId);
  const hoveredZoneId = useTwinStore((s) => s.hoveredZoneId);
  const selectZone = useTwinStore((s) => s.selectZone);
  const hoverZone = useTwinStore((s) => s.hoverZone);

  const bedLen = SCENARIO.bedLengthM;
  const robot = getRobotStateAtDay(currentDay);

  const usableW = W - PAD * 2;
  const usableH = H - PAD * 2;

  const worldToMapX = (x: number) => PAD + ((x + bedLen / 2) / bedLen) * usableW;
  const worldToMapY = (z: number) => PAD + ((z + 3.5) / 7) * usableH;

  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    hoverZone(hovered);
  }, [hovered, hoverZone]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: W,
        background: 'rgba(26,29,35,0.85)',
        border: '1px solid #2a2e36',
        borderRadius: 8,
        padding: 10,
        backdropFilter: 'blur(8px)',
        zIndex: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            fontWeight: 600,
          }}
        >
          UWB 평면도
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#60a5fa',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          x:{robot.position[0].toFixed(2)} z:{robot.position[2].toFixed(2)} m
        </div>
      </div>

      <svg width={W - 20} height={H} style={{ display: 'block', background: '#0d1117', borderRadius: 4 }}>
        {/* Grid */}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`gh${i}`}
            x1={0}
            x2={W - 20}
            y1={(i * H) / 6}
            y2={(i * H) / 6}
            stroke="#1f2530"
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: 11 }, (_, i) => (
          <line
            key={`gv${i}`}
            x1={(i * (W - 20)) / 10}
            x2={(i * (W - 20)) / 10}
            y1={0}
            y2={H}
            stroke="#1f2530"
            strokeWidth={0.5}
          />
        ))}

        {/* Path strip */}
        <rect
          x={PAD}
          y={worldToMapY(1.1) - 4}
          width={usableW}
          height={8}
          fill="#1a1f28"
          opacity={0.7}
        />

        {/* Zones (bed strip) */}
        {SCENARIO.zones.map((zone) => {
          const { dominant } = zoneHealthMix(zone, currentDay);
          const x1 = worldToMapX(zone.startX);
          const x2 = worldToMapX(zone.endX);
          const isHovered = hovered === zone.zoneId || hoveredZoneId === zone.zoneId;
          const isSelected = selectedZoneId === zone.zoneId;
          const y = worldToMapY(0) - 4;
          return (
            <g key={zone.zoneId}>
              <rect
                x={x1 + 1}
                y={y}
                width={x2 - x1 - 2}
                height={8}
                fill={HEALTH_COLORS[dominant]}
                opacity={isSelected ? 0.95 : isHovered ? 0.85 : 0.7}
                style={{ cursor: 'pointer' }}
                onClick={() => selectZone(zone.zoneId)}
                onMouseEnter={() => setHovered(zone.zoneId)}
                onMouseLeave={() => setHovered((h) => (h === zone.zoneId ? null : h))}
              />
              {/* Bed number labels (mimicking video frame_07 "5", "6") */}
              <text
                x={(x1 + x2) / 2}
                y={y + 24}
                fontSize={9}
                fill={isSelected ? '#e0e0e0' : '#6b7280'}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
                fontWeight={600}
                style={{ pointerEvents: 'none' }}
              >
                {zone.zoneId + 1}
              </text>
            </g>
          );
        })}

        {/* UWB anchors (4 corners) */}
        {[
          [-bedLen / 2 - 0.5, -2.2],
          [bedLen / 2 + 0.5, -2.2],
          [-bedLen / 2 - 0.5, 2.8],
          [bedLen / 2 + 0.5, 2.8],
        ].map(([x, z], i) => (
          <g key={`anchor_${i}`}>
            <circle
              cx={worldToMapX(x)}
              cy={worldToMapY(z)}
              r={3}
              fill="#60a5fa"
            />
            <circle
              cx={worldToMapX(x)}
              cy={worldToMapY(z)}
              r={5}
              fill="none"
              stroke="#60a5fa"
              strokeWidth={0.8}
              opacity={0.5}
            />
            <text
              x={worldToMapX(x) + (x < 0 ? -4 : 4)}
              y={worldToMapY(z) + 3}
              fontSize={8}
              fill="#60a5fa"
              textAnchor={x < 0 ? 'end' : 'start'}
              fontFamily="ui-monospace, monospace"
            >
              A{i + 1}
            </text>
          </g>
        ))}

        {/* Range lines (anchor → robot) */}
        {[
          [-bedLen / 2 - 0.5, -2.2],
          [bedLen / 2 + 0.5, -2.2],
          [-bedLen / 2 - 0.5, 2.8],
          [bedLen / 2 + 0.5, 2.8],
        ].map(([ax, az], i) => (
          <line
            key={`range_${i}`}
            x1={worldToMapX(ax)}
            y1={worldToMapY(az)}
            x2={worldToMapX(robot.position[0])}
            y2={worldToMapY(robot.position[2])}
            stroke="#60a5fa"
            strokeWidth={0.5}
            strokeDasharray="2 3"
            opacity={0.4}
          />
        ))}

        {/* Robot dot */}
        <circle
          cx={worldToMapX(robot.position[0])}
          cy={worldToMapY(robot.position[2])}
          r={5}
          fill={
            robot.task === 'capturing' ? '#fbbf24'
              : robot.task === 'returning' ? '#60a5fa'
                : '#6ee7b7'
          }
          stroke="#0d1117"
          strokeWidth={1.5}
        />
        <circle
          cx={worldToMapX(robot.position[0])}
          cy={worldToMapY(robot.position[2])}
          r={9}
          fill="none"
          stroke={
            robot.task === 'capturing' ? '#fbbf24'
              : robot.task === 'returning' ? '#60a5fa'
                : '#6ee7b7'
          }
          strokeWidth={0.8}
          opacity={0.4}
        />
      </svg>

      <div
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 9,
          color: '#6b7280',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        <span>30m × 7m · 베드 6구역</span>
        <span style={{ color: '#60a5fa' }}>UWB ±cm</span>
      </div>
    </div>
  );
}
