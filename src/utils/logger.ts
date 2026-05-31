// Namespace logger — _기본 silent_ + opt-in (URL/localStorage).
//
// Plan SSOT: `.claude/plans/sleepy-growing-pretzel.md` §1
// Docs:      `docs/architecture/LOGGING.md` (Phase L5)
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
  | 'app';          // main.tsx, ErrorBoundary, legacy log.* wrapper

export const ALL_NAMESPACES: readonly LogNamespace[] = [
  'engine', 'scene', 'quality', 'progressive', 'skinplant',
  'overlay', 'growth', 'leaf', 'plant', 'app',
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
  app:         'error',  // legacy log.* wrapper → silent
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

// ── Phase H 호환 wrapper — _legacy_, 점진 migrate (Iter 32 후보) ──
//
// Phase H에서 만든 log.dev/info/warn/error 그대로 호환.
// `log.dev` = `log.debug` alias. backing namespace = 'app' (default error)
// → log.dev/info 모두 silent (자동). warn/error는 출력.
// 빠르게 namespace logger로 migrate 권장 — 마이그레이션 후 wrapper Iter 32 제거.
interface LegacyLogger extends NamespaceLogger {
  /** @deprecated Phase L1+ — use createLogger(ns).debug instead. */
  readonly dev: LogFn;
}

function makeLegacyLog(): LegacyLogger {
  const nsLogger = createLogger('app');
  return {
    debug: nsLogger.debug,
    info:  nsLogger.info,
    warn:  nsLogger.warn,
    error: nsLogger.error,
    dev:   nsLogger.debug,  // legacy alias
  };
}

export const log: LegacyLogger = makeLegacyLog();

// ── Test-only helper (spec에서 effective() 검증용) ──
// @internal — production에서 호출 금지.
export function _getEffectiveLevelForTest(ns: LogNamespace): Level {
  return effective(ns);
}
export function _getNsDefaultsForTest(): Readonly<Record<LogNamespace, Level>> {
  return NS_DEFAULTS;
}
