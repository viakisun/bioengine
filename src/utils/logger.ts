// Namespace logger — _기본 silent_ + opt-in (URL/localStorage).
//
// Plan SSOT: `.claude/plans/sleepy-growing-pretzel.md` §1
// Docs:      `docs/architecture/LOGGING.md`
//
// API:
//   const log = createLogger('engine');
//   log.debug('creating engine');   // opt-in only
//   log.info('first frame');        // ns default 'warn' → silent
//   log.warn('init failed', err);   // 항상 출력 (silenceable)
//   log.error('fatal', err);        // 항상 출력
//
// Opt-in:
//   URL `?debug=engine,growth`   (CSV, '*' = 모든 namespace)
//   URL `?silence=growth`        (warn mute, error는 출력)
//   localStorage `debug`         (URL 미설정 시 fallback)
//   localStorage `silence`       (동일)
//
// DevTools helper (DEV only):
//   __farmsim.debug.enable('engine,growth')   — set localStorage + reload
//   __farmsim.debug.enableAll()                — = enable('*')
//   __farmsim.debug.disable()                  — clear + reload
//   __farmsim.debug.silence('growth')          — set silence + reload
//   __farmsim.debug.current()                  — print current state
//
// 모듈 로드 시점 1회 평가 — 이후 immutable. 변경하려면 location.reload().
//
// Production source의 직접 console.* 호출은 enforcement spec
// `LOGGER-NO-DIRECT-CONSOLE-01`로 금지.

export type Level = 'debug' | 'info' | 'warn' | 'error';

export type LogNamespace =
  | 'engine'        // BabylonEngine, RenderQuality
  | 'scene'         // SceneSetup, SkeletonOverlay, SceneCanvas
  | 'quality'       // QualityProbe
  | 'progressive'   // ProgressiveLoad
  | 'skinplant'     // SkinMeshPlant, ShowcasePlant (대량 build stats)
  | 'overlay'       // dockingOverlay, leafWireframe, SinglePlantOverlay
  | 'growth'        // tomato-engine/growth/* (host 측 alias)
  | 'leaf'          // LeafShapeSchema, widthProfile (식물 mesh 검증)
  | 'plant'         // 기타 plant
  | 'scenarios'     // S1.d (RFP §15) — scenario loader/validator
  | 'workbench'     // S1.g (RFP §15) — Workbench mode shell
  | 'ui';           // main.tsx global handler, ErrorBoundary

export const ALL_NAMESPACES: readonly LogNamespace[] = [
  'engine', 'scene', 'quality', 'progressive', 'skinplant',
  'overlay', 'growth', 'leaf', 'plant', 'scenarios', 'workbench', 'ui',
] as const;

const NS_DEFAULTS: Record<LogNamespace, Level> = {
  engine:      'warn',
  scene:       'warn',
  quality:     'warn',
  progressive: 'info',   // ★ user-value milestone (complete만 사용)
  skinplant:   'warn',   // build stats는 debug only — opt-in
  overlay:     'info',   // ★ hotkey toggle 같은 인터랙티브 feedback
  growth:      'warn',   // validation warn 보존
  leaf:        'warn',
  plant:       'warn',
  scenarios:   'warn',   // 시나리오 로드 실패는 warn
  workbench:   'warn',
  ui:          'error',  // global error handler만 출력 (warn/info silent)
};

const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

type LogFn = (msg: string, ...args: unknown[]) => void;

export interface NamespaceLogger {
  readonly debug: LogFn;
  readonly info: LogFn;
  readonly warn: LogFn;
  readonly error: LogFn;
}

interface OptIn {
  enabledForDebug: Set<string>;  // namespace literal or '*'
  silenced: Set<string>;
}

// ── opt-in evaluation (SSR-safe, browser only) ──

function parseCsv(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  for (const tok of s.split(',').map((t) => t.trim()).filter(Boolean)) {
    out.add(tok);
  }
  return out;
}

function parseOptIn(): OptIn {
  let debugCsv: string | null = null;
  let silenceCsv: string | null = null;

  // SSR-safe: location/localStorage가 없는 환경 (node, test) 호환
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      debugCsv = params.get('debug');
      silenceCsv = params.get('silence');
    } catch {
      // ignore
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      if (debugCsv == null) debugCsv = localStorage.getItem('debug');
      if (silenceCsv == null) silenceCsv = localStorage.getItem('silence');
    } catch {
      // ignore (private mode 등)
    }
  }
  return {
    enabledForDebug: parseCsv(debugCsv),
    silenced: parseCsv(silenceCsv),
  };
}

const OPT_IN: OptIn = parseOptIn();

function effective(ns: LogNamespace): Level {
  if (OPT_IN.silenced.has(ns)) return 'error';
  if (OPT_IN.enabledForDebug.has(ns) || OPT_IN.enabledForDebug.has('*')) {
    return 'debug';
  }
  return NS_DEFAULTS[ns];
}

// ── logger factory ──

const NOOP: LogFn = () => { /* silent */ };

function makeLevelFn(ns: LogNamespace, level: Level, eff: Level): LogFn {
  if (RANK[level] < RANK[eff]) return NOOP;
  const sink: (msg: string, ...args: unknown[]) => void =
    level === 'error' ? console.error.bind(console)
    : level === 'warn' ? console.warn.bind(console)
    : console.log.bind(console);
  const prefix = `[${ns}]`;
  return (msg: string, ...args: unknown[]) => sink(`${prefix} ${msg}`, ...args);
}

const NS_LOGGERS = new Map<LogNamespace, NamespaceLogger>();

export function createLogger(ns: LogNamespace): NamespaceLogger {
  const cached = NS_LOGGERS.get(ns);
  if (cached) return cached;
  const eff = effective(ns);
  const logger: NamespaceLogger = {
    debug: makeLevelFn(ns, 'debug', eff),
    info:  makeLevelFn(ns, 'info',  eff),
    warn:  makeLevelFn(ns, 'warn',  eff),
    error: makeLevelFn(ns, 'error', eff),
  };
  NS_LOGGERS.set(ns, logger);
  return logger;
}

// ── DevTools helper — DEV-only, manual install via installDebugHelper() ──

export interface DebugHelper {
  enable(csv: string): void;
  enableAll(): void;
  disable(): void;
  silence(csv: string): void;
  current(): void;
}

/**
 * Attach `window.__farmsim.debug` helper. Call from DEV entry point only
 * (`if (import.meta.env.DEV) installDebugHelper()`). Production no-op.
 */
export function installDebugHelper(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __farmsim?: { debug?: DebugHelper } };
  w.__farmsim = w.__farmsim ?? {};
  const sink = console.log.bind(console);
  w.__farmsim.debug = {
    enable(csv: string): void {
      try {
        localStorage.setItem('debug', csv);
        sink(`[debug] enabled: ${csv} (reloading...)`);
        location.reload();
      } catch (err) {
        sink(`[debug] enable failed: ${String(err)}`);
      }
    },
    enableAll(): void {
      this.enable('*');
    },
    disable(): void {
      try {
        localStorage.removeItem('debug');
        localStorage.removeItem('silence');
        sink('[debug] disabled (reloading...)');
        location.reload();
      } catch (err) {
        sink(`[debug] disable failed: ${String(err)}`);
      }
    },
    silence(csv: string): void {
      try {
        localStorage.setItem('silence', csv);
        sink(`[debug] silenced: ${csv} (reloading...)`);
        location.reload();
      } catch (err) {
        sink(`[debug] silence failed: ${String(err)}`);
      }
    },
    current(): void {
      let urlDebug: string | null = null;
      let urlSilence: string | null = null;
      let lsDebug: string | null = null;
      let lsSilence: string | null = null;
      try {
        const params = new URLSearchParams(location.search);
        urlDebug = params.get('debug');
        urlSilence = params.get('silence');
      } catch {
        // ignore
      }
      try {
        lsDebug = localStorage.getItem('debug');
        lsSilence = localStorage.getItem('silence');
      } catch {
        // ignore
      }
      sink(`[debug] URL ?debug    = ${urlDebug ?? '(none)'}`);
      sink(`[debug] URL ?silence  = ${urlSilence ?? '(none)'}`);
      sink(`[debug] localStorage.debug    = ${lsDebug ?? '(none)'}`);
      sink(`[debug] localStorage.silence  = ${lsSilence ?? '(none)'}`);
      sink('[debug] NS_DEFAULTS  =', NS_DEFAULTS);
      sink('[debug] effective per namespace:');
      for (const ns of ALL_NAMESPACES) {
        sink(`  [${ns.padEnd(11)}] ${effective(ns)}`);
      }
    },
  };
}

// ── Test-only helper (spec에서 effective() 검증용) ──
// @internal — production에서 호출 금지.
export function _getEffectiveLevelForTest(ns: LogNamespace): Level {
  return effective(ns);
}
export function _getNsDefaultsForTest(): Readonly<Record<LogNamespace, Level>> {
  return NS_DEFAULTS;
}
