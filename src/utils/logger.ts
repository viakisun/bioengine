// ★ Iter 31 R26 cleanup (Phase H) — production logger spam wrapping utility.
//
// Policy (`docs/architecture/STEM_LOCAL_FRAME.md` 와 동일 Phase plan §9):
//   - `log.dev(...)` — DEV mode에서만 console.log (vite import.meta.env.DEV)
//   - `log.info(...)` — production milestone (사용자 가치 있는 정보 — 정리 후 1~2건)
//   - `log.warn(...)` — production warning (진단 가치 — _항상_ 출력)
//   - `log.error(...)` — production error (_항상_)
//
// Migration:
//   `console.log('[Foo] starting ...')` → `log.dev('[Foo] starting ...')`
//   `console.log('[ProgressiveLoad] complete')` → `log.info('[ProgressiveLoad] complete')`
//   `console.warn(...)` → 그대로 유지 또는 `log.warn(...)`
//
// CLI scripts (`growth-calibration/scripts/`, `packages/tomato-engine/test-*.ts`)
// 와 진단 함수 (`src/plant/diagnostics/`) 는 본 utility 미적용 — 호출자 의도 보존.

const DEV = import.meta.env.DEV;

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export const log: {
  dev: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
} = {
  dev: DEV ? console.log.bind(console) : noop,
  info: console.log.bind(console),  // milestone — production 출력
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
