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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Picker } from '../scenarios/Picker';
import { Composer } from '../composer/Composer';
import { MyScenarios } from '../composer/MyScenarios';
import { useComposerStore } from '../composer/composerStore';
import { Calibration } from '../calibration/Calibration';
import { RobotPlaceholder } from './RobotPlaceholder';
import { TaskPanel } from './TaskPanel';
import { TimelineBar, type TimelinePlayback } from '../../hud/TimelineBar';
import { CameraDock } from '../../hud/CameraDock';
import { EeCameraTuner } from '../../hud/EeCameraTuner';
import { lockSeed } from '../../core/Determinism';
import { useTwinStore } from '../../state/twinStore';
import type { ScenarioSpec } from '../../scenarios/types';
import { getScenarioById } from '../../scenarios/loader';
import { createLogger } from '../../utils/logger';
import {
  DEFAULT_SCENE_OPTIONS,
  scenarioToOptions,
  serializeSceneOptions,
} from '../../scene/sceneOptions';
import {
  applyTargetOutline,
  clearAllHighlights,
  extractTrussOrdinalFromTarget,
} from '../../scene/plant/PlantHighlight';
import { getSinglePlantSkinMesh } from '../../hud/single-plant/useSinglePlantState';
import { GimbalView } from '../../hud/GimbalView';
// Instrument Workstation chrome
import { TopCommandBar } from '../../hud/instrument/TopCommandBar';
import { SettingsDrawer } from '../../hud/instrument/SettingsDrawer';
import { StatsHud } from '../../hud/instrument/StatsHud';
import { Toast } from '../../hud/instrument/Toast';
import { RobotTransport } from '../../hud/instrument/RobotTransport';
import { SurveyResultSheet } from '../../hud/instrument/SurveyResultSheet';
import { SurveyHistoryDrawer } from '../../hud/instrument/SurveyHistoryDrawer';
// Phenotyping survey engine
import { planSurveyZones } from '../../scenarios/phenotyping/zonePlan';
import { createSurveyRunner, type SurveyRunner } from '../../scenarios/phenotyping/surveyRunner';
import { surveyStore, newSurveyId, type SurveyRecord, type ZoneRecord } from '../../scenarios/phenotyping/surveyStore';
import { getActivePlantManager } from '../../scene/PlantManager';
import { getSinglePlantEngine } from '../../hud/single-plant/useSinglePlantState';
import { railRef, gimbalCamRef } from '../../scene/robot/robotControlState';

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

  // Instrument Workstation shell — body class for token reset + Esc/? hotkeys.
  useEffect(() => {
    document.body.classList.add('iw-shell');
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        useTwinStore.getState().toggleUiMode();
      } else if (e.key === '?' || e.key === '~') {
        e.preventDefault();
        useTwinStore.getState().toggleStatsOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      document.body.classList.remove('iw-shell');
      window.removeEventListener('keydown', handler);
    };
  }, []);

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
    useTwinStore.getState().applyLightingPreset(s.env.lightingPreset);
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

    // §21 — phenotyping 시나리오 진입은 SceneOptions 직렬화로 URL push + reload.
    //   기존 hand-rolled URL params → serializeSceneOptions (sceneOptions.ts) 단일 함수.
    if (s.domain === 'phenotyping' && s.world.bedLayout) {
      const cult = s.crop.cultivation;
      if (cult) {
        useTwinStore.getState().setDefoliationHeightCm(cult.deleafHeightCm ?? 0);
      }
      const cur = new URL(window.location.href);
      const already =
        cur.searchParams.get('scenario') === s.id &&
        cur.searchParams.get('bedLayout') &&
        cur.searchParams.get('activeBedIds');
      if (already) return;

      // SceneOptions 합성 — default + scenarioToOptions(s).
      const merged = { ...DEFAULT_SCENE_OPTIONS, ...scenarioToOptions(s) };
      const params = serializeSceneOptions(merged);
      params.set('mode', 'workbench');
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

  // ── Phenotyping survey orchestration ──────────────────────────────
  // Maintain a single SurveyRunner per workbench mount.  Wire its
  // callbacks into twinStore.phenotypingSurvey + surveyStore (IndexedDB).
  const surveyRunnerRef = useRef<SurveyRunner | null>(null);
  const surveyRecordRef = useRef<SurveyRecord | null>(null);
  const surveyStatus = useTwinStore((s) => s.phenotypingSurvey.status);

  const initSurveyRunner = (): SurveyRunner | null => {
    if (!active || active.domain !== 'phenotyping') return null;
    if (surveyRunnerRef.current) return surveyRunnerRef.current;
    const mgr = getActivePlantManager();
    const eng = getSinglePlantEngine();
    const cam = gimbalCamRef.current;
    if (!mgr || !eng || !cam) return null;
    const scene = cam.getScene();
    const zones = planSurveyZones({ scenario: active, plantManager: mgr });
    if (zones.length === 0) return null;

    useTwinStore.getState().surveySetTotalZones(zones.length);

    const runner = createSurveyRunner({
      zones, scene, camera: cam,
      plantManager: mgr,
      growthEngine: eng,
      getMinute: () => useTwinStore.getState().singlePlantMinute,
      setRobotMode: (m) => useTwinStore.getState().setRobotMode(m),
      setGimbalSide: (s) => {
        // Use store action for manual pan override
        if (s === 'left') useTwinStore.getState().setGimbalPan(0);
        else if (s === 'right') useTwinStore.getState().setGimbalPan(Math.PI);
        else useTwinStore.getState().setGimbalPan(-Math.PI / 2);
      },
      onPhaseChange: (phase, zi) => {
        const zone = zones[zi];
        useTwinStore.getState().surveySetPhase(phase, zone?.id ?? null);
      },
      onZoneCaptured: (result) => {
        useTwinStore.getState().surveyRecordZone(result.zoneId, {
          completedAt: result.capturedAt,
          targetBedId: result.zone.targetBedId,
          bedSide: result.zone.bedSide,
          direction: result.zone.direction,
          fruitCount: result.rawCount,
          weightedCount: result.weightedCount,
          expectedFruitCount: result.expectedFruitCount,
          coverage: result.coverage,
          avgConfidence: result.avgConfidence,
          bins: result.bins,
          weightedBins: result.weightedBins,
        });
        // Append zone to record for persistence
        if (surveyRecordRef.current) {
          const zr: ZoneRecord = {
            zoneId: result.zoneId,
            index: result.zone.index,
            direction: result.zone.direction,
            bedSide: result.zone.bedSide,
            targetBedId: result.zone.targetBedId,
            railX: result.zone.railX,
            capturedAt: result.capturedAt,
            fruits: result.fruits,
            fruitCount: result.rawCount,
            weightedCount: result.weightedCount,
            expectedFruitCount: result.expectedFruitCount,
            coverage: result.coverage,
            avgConfidence: result.avgConfidence,
            bins: result.bins,
            weightedBins: result.weightedBins,
          };
          surveyRecordRef.current.zones.push(zr);
        }
      },
      onDone: () => {
        useTwinStore.getState().surveySetStatus('done');
        const rec = surveyRecordRef.current;
        if (!rec) return;
        rec.completedAt = new Date().toISOString();
        rec.status = 'completed';
        rec.elapsedMs = useTwinStore.getState().phenotypingSurvey.elapsedMs;
        // Path length: rail traverse (forward + return) ≈ 2 × range × #passes
        rec.pathLengthM = 2 * 14 * (zones.filter((z) => z.direction === 'forward').length > 0 ? 1 : 0
          + (zones.filter((z) => z.direction === 'return').length > 0 ? 1 : 0));
        // Totals = aggregate
        const t = { fruitCount: 0, weightedCount: 0, coverage: 0, avgConfidence: 0,
          bins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 },
          weightedBins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 } };
        for (const z of rec.zones) {
          t.fruitCount += z.fruitCount;
          t.weightedCount += z.weightedCount;
          (['green', 'breaker', 'turning', 'pink', 'red'] as const).forEach((b) => {
            t.bins[b] += z.bins[b] ?? 0;
            t.weightedBins[b] += z.weightedBins[b] ?? 0;
          });
        }
        t.coverage = rec.zones.length === 0 ? 0
          : rec.zones.reduce((a, z) => a + z.coverage, 0) / rec.zones.length;
        t.avgConfidence = rec.zones.length === 0 ? 0
          : rec.zones.reduce((a, z) => a + z.avgConfidence, 0) / rec.zones.length;
        rec.totals = { zoneCount: rec.zones.length, ...t };
        surveyStore.save(rec)
          .then(() => useTwinStore.getState().setLastSurveyId(rec.id))
          .catch((err) => log.warn('surveyStore.save failed:', err));
      },
    });
    surveyRunnerRef.current = runner;
    return runner;
  };

  const onStartSurvey = () => {
    const runner = initSurveyRunner();
    if (!runner || !active) return;
    // Reset previous state and create new in-progress record
    useTwinStore.getState().surveyReset();
    const mgr = getActivePlantManager();
    const zones = mgr ? planSurveyZones({ scenario: active, plantManager: mgr }) : [];
    useTwinStore.getState().surveySetTotalZones(zones.length);

    const id = newSurveyId();
    surveyRecordRef.current = {
      id,
      schemaVersion: '1.0',
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'in-progress',
      scenarioId: active.id,
      scenarioVersion: active.version ?? 'unknown',
      cropDay: active.crop.day,
      cropSeed: String(active.crop.seed),
      cropCultivar: active.crop.cultivar ?? 'unknown',
      cropMinute: useTwinStore.getState().singlePlantMinute,
      envLightingPreset: active.env.lightingPreset,
      envManualHour: active.env.manualHour,
      robotProfile: active.robot?.profile ?? 'phenotyping',
      cameraConfig: {
        lensFovDeg: active.robot?.camera?.head?.lens ?? 60,
        mountHeightM: active.robot?.camera?.head?.mountHeight ?? 1.28,
      },
      rule: active.task.rule ?? 'left-bed-on-forward,right-bed-on-return',
      detector: {
        version: 'gt-v1',
        workingDistanceM: { min: 0.3, max: 3.0 },
        referenceSolidAngleSr: 4e-4,
        occlusionMode: 'none',
      },
      zones: [],
      totals: { zoneCount: 0, fruitCount: 0, weightedCount: 0,
        bins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 },
        weightedBins: { green: 0, breaker: 0, turning: 0, pink: 0, red: 0 },
        coverage: 0, avgConfidence: 0 },
      pathLengthM: 0,
      elapsedMs: 0,
    };
    useTwinStore.getState().surveySetStatus('running');
    runner.start();
  };

  const onPauseSurvey = () => {
    surveyRunnerRef.current?.pause();
    useTwinStore.getState().surveySetStatus('paused');
  };
  const onResumeSurvey = () => {
    surveyRunnerRef.current?.resume();
    useTwinStore.getState().surveySetStatus('running');
  };
  const onResetSurvey = () => {
    surveyRunnerRef.current?.stop();
    useTwinStore.getState().surveyReset();
    surveyRecordRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => () => {
    surveyRunnerRef.current?.stop();
    surveyRunnerRef.current = null;
    surveyRecordRef.current = null;
  }, []);

  if (!active) return null;

  return (
    <>
      {/* ░░░ TOP COMMAND BAR (46px) ░░░ */}
      <TopCommandBar
        scenarioId={active.id}
        day={day}
        onPicker={() => setView('picker')}
        onFork={() => handleCompose(active)}
        onCalibration={() => setView('calibration')}
      />

      {/* ░░░ LEFT SENSOR RAIL (62px) ░░░ */}
      <CameraDock active={cameraView} onSelect={setCameraView} />

      {/* ░░░ EE Camera tuner — only when EE/Depth view active ░░░ */}
      <EeCameraTuner activeView={cameraView} />

      {/* ░░░ CENTER VIEWPORT OVERLAYS ░░░ */}
      {/* PiP gimbal view (top-left of viewport) */}
      {active.domain === 'phenotyping' && <GimbalView scenarioId={active.id} />}

      {/* Robot transport dock (bottom-left of viewport) — with survey controls when phenotyping */}
      {active.domain === 'phenotyping' && (
        <RobotTransport
          surveyControls={{
            status: surveyStatus,
            onStart: onStartSurvey,
            onPause: onPauseSurvey,
            onResume: onResumeSurvey,
            onReset: onResetSurvey,
          }}
        />
      )}

      {/* Stats HUD (toggleable, top-right of viewport) */}
      <StatsHud />

      {/* Toast (auto-dismiss WebGPU notice) */}
      <Toast />

      {/* Robot placeholder (other camera modes) */}
      <RobotPlaceholder activeView={cameraView} />

      {/* ░░░ RIGHT EXPERIMENT INSPECTOR (344px, collapses in drive mode) ░░░ */}
      <TaskPanel scenario={active} />

      {/* ░░░ BOTTOM SIM TRANSPORT (54px) ░░░ */}
      <TimelineBar playback={playback} minDay={0} maxDay={120} />

      {/* ░░░ SETTINGS DRAWER (right slide-in) ░░░ */}
      <SettingsDrawer
        defoliationEnabled={!!(active.domain === 'phenotyping' && active.crop.cultivation?.deleafEnabled)}
        defoliationMaxCm={active.crop.cultivation?.deleafMaxCm ?? 100}
        onOpenCalibration={() => setView('calibration')}
        onFork={() => handleCompose(active)}
      />

      {/* ░░░ SURVEY HISTORY DRAWER (right slide-in, IndexedDB) ░░░ */}
      <SurveyHistoryDrawer />

      {/* ░░░ SURVEY RESULT SHEET (modal, auto-opens on completion) ░░░ */}
      <SurveyResultSheet />

      {/* Reference unused vars to silence noUnusedLocals if any */}
      <span style={{ display: 'none' }} aria-hidden>{railRef.current}</span>
    </>
  );
}
