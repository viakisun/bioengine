// S1.g (RFP §15) — Workbench Mode overlay.
//
// 진입 흐름:
//   1. 마운트 시 Picker 표시 → 사용자가 시나리오 선택
//   2. Picker 닫고 헤더 ValueChip + 하단 TimelineBar overlay
//   3. "다른 시나리오" 버튼으로 Picker 재진입
//
// S1 mvp:
//   - 시간 슬라이더는 자체 useState (BabylonEngine 식물 hook은 S2 이후 연결)
//   - 시나리오 선택 시 Determinism.lockSeed + 시드 표시
//   - SinglePlantApp 위에 overlay로 마운트 (App.tsx에서 'workbench' 진입 시 사용)
//
// S2+ 작업:
//   - BabylonEngine과 양방향 playback hook (twinStore.currentDay 재추가 또는 store 신설)
//   - 시나리오 crop.day 기반으로 초기 day 설정
//   - end-effector 카메라 전환 단축키 (S4)

import { useEffect, useMemo, useState } from 'react';
import { Picker } from '../scenarios/Picker';
import { Composer } from '../composer/Composer';
import { MyScenarios } from '../composer/MyScenarios';
import { useComposerStore } from '../composer/composerStore';
import { Calibration } from '../calibration/Calibration';
import { RobotPlaceholder } from './RobotPlaceholder';
import { TaskPanel } from './TaskPanel';
import { ValueChip } from '../../hud/ValueChip';
import { TimelineBar, type TimelinePlayback } from '../../hud/TimelineBar';
import { CameraDock } from '../../hud/CameraDock';
import { EeCameraTuner } from '../../hud/EeCameraTuner';
import { lockSeed, getActiveSeed } from '../../core/Determinism';
import { MODES } from '../registry';
import { useTwinStore } from '../../state/twinStore';
import type { ScenarioSpec } from '../../scenarios/types';
import { getScenarioById } from '../../scenarios/loader';
import { createLogger } from '../../utils/logger';
import {
  applyTargetOutline,
  clearAllHighlights,
  extractTrussOrdinalFromTarget,
} from '../../scene/plant/PlantHighlight';
import { getSinglePlantSkinMesh } from '../../hud/single-plant/useSinglePlantState';
import { DefoliationSlider } from '../../hud/single-plant/DefoliationSlider';
import { GimbalView } from '../../hud/GimbalView';
import { PhenotypingControls } from '../../hud/PhenotypingControls';
import { MemoryStats } from '../../hud/MemoryStats';

const log = createLogger('workbench');

type View = 'picker' | 'composer' | 'my-scenarios' | 'calibration' | 'workbench';

export function Workbench() {
  const [active, setActive] = useState<ScenarioSpec | null>(null);
  const [view, setView] = useState<View>('picker');
  const [cameraView, setCameraView] = useState(1);
  const composer = useComposerStore();

  // D0.f (RFP §17) — twinStore.singlePlantMinute 구독 (App.tsx usePlantPlayback 활용).
  //   day = minute / 1440. setDay → minute (day*1440 + 12*60 noon).
  const minute = useTwinStore((s) => s.singlePlantMinute);
  const playing = useTwinStore((s) => s.singlePlantPlaying);
  const playSpeed = useTwinStore((s) => s.singlePlantSpeed);
  const setMinute = useTwinStore((s) => s.setSinglePlantMinute);
  const setPlaying = useTwinStore((s) => s.setSinglePlantPlaying);
  const setPlaySpeedStore = useTwinStore((s) => s.setSinglePlantSpeed);
  const day = minute / 1440;
  const setDay = (d: number) => setMinute(d * 1440 + 12 * 60);

  // §19 deep-link — URL `?scenario=ID` 로 진입 시 Picker 거치지 않고 자동 active.
  //   reload 후 들어왔을 때 사용자가 카드를 다시 클릭하지 않아도 시나리오 적용.
  useEffect(() => {
    if (active) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const scenarioId = params.get('scenario');
    if (!scenarioId) return;
    const spec = getScenarioById(scenarioId);
    if (!spec) {
      log.warn(`Deep-link scenario not found: ${scenarioId}`);
      return;
    }
    // handleSelect 호출 — 시나리오 적용 + 화면 전환.
    // 단 phenotyping은 다시 URL push + reload되면 무한 루프 → handleSelect 안의
    //   'already' check가 막아줌 (현재 URL과 동일하면 skip).
    handleSelect(spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D0.d (RFP §17) — 시나리오 선택 시 twinStore 동기.
  useEffect(() => {
    if (!active) return;
    const trussOrdinal = extractTrussOrdinalFromTarget(active.task?.targets);
    const taskType = active.task?.type;
    const domain = active.domain;
    const apply = (attempt = 0) => {
      const skin = getSinglePlantSkinMesh();
      if (!skin) {
        if (attempt < 20) setTimeout(() => apply(attempt + 1), 200);
        return;
      }
      const scene = skin.root.getScene();
      applyTargetOutline(scene, {
        taskType: domain === 'thinning' ? 'thinning' : taskType,
        trussOrdinal,
      });
    };
    apply();
    useTwinStore.getState().setShowSkeleton(domain === 'pruning');
    return () => {
      const skin = getSinglePlantSkinMesh();
      if (skin) clearAllHighlights(skin.root.getScene());
      useTwinStore.getState().setShowSkeleton(false);
    };
  }, [active]);

  function handleSelect(s: ScenarioSpec) {
    lockSeed(s.crop.seed);
    const minute = s.crop.day * 1440 + 12 * 60; // 시나리오 day 정오로 시작
    useTwinStore.getState().setSinglePlantMinute(minute);
    // D0.e env hook
    useTwinStore.getState().setLighting({ manualHour: s.env.manualHour });
    if (s.env.wind) {
      useTwinStore.getState().setWindStrength(s.env.wind.strength);
      useTwinStore.getState().setWindDirection(s.env.wind.direction);
    }

    // ★ V2 — 도메인별 자동 카메라 view 선택.
    const autoCam = pickCameraForDomain(s.domain);
    setCameraView(autoCam);

    // ★ V2 — 시나리오의 robot.camera 파라미터 → eeCameraParams 자동 반영.
    //   EE 카메라(2) 또는 Depth 카메라(6) 활성 시 사용.
    const eeCamera = s.robot?.camera?.endEffector ?? s.robot?.camera?.head;
    if (eeCamera) {
      const setParam = useTwinStore.getState().setEeCameraParam;
      if (eeCamera.lens !== undefined) setParam('fovDeg', eeCamera.lens);
      if (eeCamera.mountHeight !== undefined) {
        // 시나리오의 mountHeight (m, plant root 기준 또는 absolute) →
        // EE store는 베드 substrate top 기준 cm. 베드 top ≈ 1.062m.
        // 시나리오 값이 1.0~2.0m 범위라면 absolute world Y → cm 환산.
        const heightCm = Math.round((eeCamera.mountHeight - 1.062) * 100);
        setParam('mountHeightCmAboveBed', Math.max(0, Math.min(150, heightCm)));
      }
    }

    // 시나리오 day에 따라 targetY 자동 (식물 크기에 맞춤)
    //   D0~30 → 1.0m, D30~70 → 1.5m, D70~120 → 2.0m
    const autoTargetY =
      s.crop.day < 30 ? 1.0 : s.crop.day < 70 ? 1.5 : 2.0;
    useTwinStore.getState().setEeCameraParam('targetY', autoTargetY);

    setDay(s.crop.day);
    setActive(s);
    setView('workbench');
    log.info(
      `Scenario loaded: ${s.id} (day=${s.crop.day}→minute=${minute}, seed=${s.crop.seed}, hour=${s.env.manualHour}, autoCam=${autoCam})`,
    );

    // §19 phenotyping — 베드 layout · 적엽 · gimbal view · traverse 모두 boot time URL param.
    //   현재 boot 후 runtime rebuild 불가 → URL push + reload.
    if (s.domain === 'phenotyping' && s.world.bedLayout) {
      // 적엽 값 store 동기
      const cult = s.crop.cultivation;
      if (cult) {
        useTwinStore.getState().setDefoliationHeightCm(cult.deleafHeightCm ?? 0);
      }
      const cur = new URL(window.location.href);
      const already =
        cur.searchParams.get('scenario') === s.id &&
        cur.searchParams.get('bedLayout') &&
        cur.searchParams.get('activeBedIds') &&
        cur.searchParams.get('robotProfile') === (s.robot?.profile ?? 'phenotyping');
      if (already) return;

      const layout = s.world.bedLayout;
      const activeBedIds = (s.world.activeBeds ?? []).join(',');
      const params = new URLSearchParams();
      params.set('mode', 'workbench');
      params.set('scenario', s.id);
      params.set('bedLayout', `${layout.leftCols}-${layout.rightCols}-${layout.stride}`);
      params.set('activeBedIds', activeBedIds);
      params.set('robotProfile', s.robot?.profile ?? 'phenotyping');
      params.set('robotTraverse', '1');
      params.set('gimbalView', '1');
      // §19 — phenotyping은 RenderQuality preset 1 (Minimum) 강제 — shadow off · MSAA 1 · hw scale 0.5.
      params.set('qualityPreset', '1');
      window.location.href = `${cur.pathname}?${params.toString()}`;
    }
  }

  /** ★ V2 — 도메인에 따른 자동 카메라 view 번호 (CameraDock 1~9). */
  function pickCameraForDomain(domain: ScenarioSpec['domain']): number {
    switch (domain) {
      case 'thinning':
      case 'pruning':
        return 2; // EE — 정밀 작업
      case 'autonomous-driving':
        return 3; // Head — 광각 전방
      case 'spray':
        return 4; // Top — 다구역 zone
      case 'recognition':
        return 8; // Frust — 다양한 angle (Foundry는 별도지만 Workbench 진입 시)
      case 'phenotyping':
        return 3; // Head — 통로 1인칭 (짐벌 별도 viewport)
      default:
        return 1; // Obj
    }
  }

  function handleCompose(base?: ScenarioSpec) {
    if (base) {
      composer.loadFromScenario(base);
    } else {
      composer.resetToAdHoc();
    }
    setView('composer');
  }

  const playback: TimelinePlayback = useMemo(
    () => ({
      currentDay: day,
      playing,
      playSpeed,
      setDay,
      togglePlay: () => setPlaying(!playing),
      setPlaySpeed: (s: number) => setPlaySpeedStore(s as 1 | 4 | 24),
    }),
    // setDay·setMinute·setPlaying·setPlaySpeedStore는 zustand에서 stable
    [day, playing, playSpeed, setMinute, setPlaying, setPlaySpeedStore],
  );

  if (view === 'picker') {
    return (
      <Picker
        onSelect={handleSelect}
        onCancel={active ? () => setView('workbench') : undefined}
        onCompose={handleCompose}
        onOpenMyScenarios={() => setView('my-scenarios')}
        modeFilter="Workbench"
      />
    );
  }

  if (view === 'composer') {
    return (
      <Composer
        onRun={handleSelect}
        onCancel={() => setView('picker')}
      />
    );
  }

  if (view === 'my-scenarios') {
    return (
      <MyScenarios
        onSelect={handleSelect}
        onEditInComposer={(s) => {
          composer.loadFromScenario(s);
          setView('composer');
        }}
        onCancel={() => setView('picker')}
      />
    );
  }

  if (view === 'calibration') {
    return <Calibration onCancel={() => setView(active ? 'workbench' : 'picker')} />;
  }

  if (!active) return null;

  const valueProps = MODES.workbench.valueProps ?? [];
  const activeSeed = getActiveSeed();

  return (
    <>
      {/* Header overlay — ValueChip + 시나리오 정보 + Picker 재진입 */}
      <div
        className="phytosim-workbench-header"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          color: 'var(--p-fg, #ddd)',
          fontSize: 12,
          zIndex: 1000,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <span
          className="p-mono"
          style={{
            fontWeight: 600,
            letterSpacing: '0.01em',
          }}
        >
          Workbench
        </span>
        <ValueChip active={valueProps} compact />
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--p-fg-muted, #aaa)' }}>
          scenario: <strong className="p-mono">{active.id}</strong>
        </span>
        {activeSeed && (
          <span className="p-mono" style={{ fontSize: 11, color: 'var(--p-fg-dim, #888)' }}>
            seed {activeSeed}
          </span>
        )}
        <button
          className="p-btn"
          onClick={() => setView('picker')}
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          다른 시나리오
        </button>
        <button
          className="p-btn"
          onClick={() => handleCompose(active)}
          style={{ padding: '4px 10px', fontSize: 11 }}
          title="현재 시나리오를 Composer에서 fork"
        >
          Fork
        </button>
        <button
          className="p-btn"
          onClick={() => setView('calibration')}
          style={{ padding: '4px 10px', fontSize: 11 }}
          title="Reference Truth Calibration — 문헌 ±20% 검증"
        >
          Calibration
        </button>
      </div>

      {/* S4.c — Camera Dock (1~9 단축키) */}
      <CameraDock active={cameraView} onSelect={setCameraView} />

      {/* D11 (사용자 피드백) — EE/Depth 활성 시 산업 파라미터 조절 UI */}
      <EeCameraTuner activeView={cameraView} />

      {/* D1 (RFP §17) — TaskPanel (시나리오 도메인·작업·메트릭) */}
      <TaskPanel scenario={active} />

      {/* S4.a — Robot placeholder (mvp) */}
      <RobotPlaceholder activeView={cameraView} />

      {/* §19 phenotyping — 적엽 slider + 짐벌 카메라 + runtime controls (Quality·Plant count) */}
      {active.domain === 'phenotyping' && active.crop.cultivation?.deleafEnabled && (
        <DefoliationSlider max={active.crop.cultivation.deleafMaxCm ?? 100} />
      )}
      {active.domain === 'phenotyping' && (
        <>
          <PhenotypingControls
            initialQuality={parseInt(
              new URLSearchParams(window.location.search).get('qualityPreset') ?? '1',
              10,
            )}
          />
          <GimbalView scenarioId={active.id} />
          <MemoryStats />
        </>
      )}

      {/* Bottom overlay — TimelineBar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <TimelineBar playback={playback} minDay={0} maxDay={120} />
      </div>
    </>
  );
}
