// packages/tomato-engine 독립 logger — Browser + Node 호환.
//
// host app `src/utils/logger.ts`와 _동일 ABI_ (createLogger / NamespaceLogger).
// 단 packages 경계 위반 회피 위해 _자체 모듈_.
//
// Browser 환경: location/localStorage 평가 (host logger와 동일 opt-in).
// Node 환경 (test/CLI): process.env.DEBUG (debug npm pattern).
//
// LogNamespace는 packages 내부에서 사용하는 subset.

export type Level = 'debug' | 'info' | 'warn' | 'error';

export type LogNamespace = 'growth';  // 확장 시 union 추가

const NS_DEFAULTS: Record<LogNamespace, Level> = {
  growth: 'warn',  // validation warn 보존
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
  enabledForDebug: Set<string>;
  silenced: Set<string>;
}

function parseCsv(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  for (const tok of s.split(',').map((t) => t.trim()).filter(Boolean)) {
    out.add(tok);
  }
  return out;
}

function parseOptIn(): OptIn {
  let debugCsv: string | null | undefined = null;
  let silenceCsv: string | null | undefined = null;

  // Browser path
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
      // ignore
    }
  }
  // Node fallback (test/CLI)
  if (debugCsv == null && typeof process !== 'undefined' && process.env) {
    debugCsv = process.env.DEBUG ?? null;
    silenceCsv = process.env.SILENCE ?? null;
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
