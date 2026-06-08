// S1.g (RFP §15) — Determinism mvp.
//
// Mode 진입 시 시드 락. seeded RNG wrapper 제공.
// architecture spec test (no-direct-random)에서 import 인정 시드만 통과.
//
// Full Determinism (frame hash · trajectory hash · Math.random/Date.now lint)은
// S3.a (Reference Truth slice)에서 강화. 본 파일은 mvp 인터페이스만 정립.

import { createLogger } from '../utils/logger';

const log = createLogger('engine');

/** xorshift32 — fast 32-bit seeded RNG. mvp 용. */
export class SeededRng {
  private state: number;

  constructor(seedHex: string) {
    this.state = parseSeed(seedHex);
  }

  /** [0, 1) uniform. Math.random 대체. */
  next(): number {
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    // uint32 → [0, 1).
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  }

  /** integer [min, max). */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }
}

function parseSeed(seedHex: string): number {
  // 0x prefix 허용. 32-bit truncate.
  const trimmed = seedHex.startsWith('0x') ? seedHex.slice(2) : seedHex;
  const n = Number.parseInt(trimmed, 16);
  if (Number.isNaN(n)) {
    log.warn(`Determinism: invalid seed "${seedHex}", fallback to 0xDEADBEEF`);
    return 0xdeadbeef;
  }
  // xorshift32 cannot start from 0.
  return (n | 0) === 0 ? 0xdeadbeef : n | 0;
}

/** Mode 진입 시 호출. activeSeed 보관 + 외부 entropy 격리 경고. */
let activeSeed: string | null = null;

export function lockSeed(seedHex: string): void {
  activeSeed = seedHex;
  log.debug(`Determinism: seed locked = ${seedHex}`);
}

export function getActiveSeed(): string | null {
  return activeSeed;
}

/** Composer Variable 토글 또는 시나리오 전환 시 호출. */
export function clearSeed(): void {
  activeSeed = null;
}
