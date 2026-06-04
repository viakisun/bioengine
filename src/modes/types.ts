// ★ S136 (Iter 41) — Mode 시스템 타입.
//
// 사용자 v3: "GreenHouse Mode, SinglePlant Mode를 진입점에 놓고,
//   향후 모드가 여러 형태로 추가될 수 있는 것을 고려해서 만들면 좋을거 같아."
//
// 진입점 architecture: App.tsx → ModeSelector → 선택 mode → Scene build.
// Registry pattern으로 확장 가능 (Robot, Sandbox 등 후속 mode 추가 용이).

export type ModeKey = 'single-plant' | 'greenhouse';

/** Mode 진입 시 사용자가 선택할 수 있는 렌더링 품질. */
export type QualityLevel = 'low' | 'medium' | 'high';

/** Mode-specific quality config (모드별 의미 다름). */
export interface ModeQualityConfig {
  /** Stem/leaf vertex density. low → ultra-low LOD, medium → tactical optimized, high → full. */
  level: QualityLevel;
  /** Showcase 외 추가 식물 수 (greenhouse 모드만 의미). single-plant=0. */
  extraPlants?: number;
  /** Greenhouse infrastructure 표시 (frame/roof/walls/wires/beds). single-plant=false. */
  showGreenhouseInfra?: boolean;
}

/**
 * Mode specification — 진입 화면 카드에 표시되는 정보 + scene build pipeline.
 *
 * Registry에 등록되면 ModeSelector 카드 자동 추가.
 */
export interface ModeSpec {
  /** Unique key. */
  key: ModeKey;
  /** 한글 이름 — 진입 카드 상단. */
  name: string;
  /** 한 문장 설명 — 카드 본문. */
  description: string;
  /** Emoji 또는 SVG path. */
  icon: string;
  /** 기본 quality config (사용자 진입 시 ModeSelector에서 조정 가능). */
  defaultQuality: ModeQualityConfig;
  /**
   * Quality level 옵션 (사용자가 선택 가능한 범위).
   * 일부 모드는 일부 옵션만 의미 (예: single-plant는 medium/low 무의미).
   */
  availableQualityLevels: QualityLevel[];
}
