// Phase L6 — Production silence verification.
//
// Boot 출력이 _기본_ silent (1~3 lines)임을 page.on('console')로 자동 검증.
//
// Iter 35: ProgressiveLoad 제거 — [progressive] complete 1줄 expectation 삭제.
//   single-plant 즉시 진입 + quality 즉시 적용. boot console 0~3줄 (warn만).

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

interface ConsoleLine {
  type: string;
  text: string;
}

// Logger 외 framework / driver / dev-tool 메시지는 제외
const EXCLUDE_PATTERNS = [
  /^\[vite\]/,
  /^BJS - /,                                  // Babylon prefix
  /\[Violation\]/,                             // 'requestAnimationFrame' handler
  /installHook\.js/,                           // React DevTools hook
  /react-dom/,                                  // React stack
  /react_jsx/,
  /이 경고 이해하기/,                           // Chrome console l10n
  /^\s*$/,                                     // empty
  /^<.*>$/,                                    // <button> etc.
  /^\(익명\)/,                                  // anonymous stack frame
  /^\s+@\s/,                                   // stack trace
  /^[a-zA-Z]+\s*@\s/,                          // "renderWithHooks @ ..."
  /Download the React DevTools/,                // React DevTools banner
  /No available adapters/,                      // WebGPU
  /\.WebGL-/,                                   // WebGL driver message
  /^WebGL: /,                                   // WebGL warning
  /^WebGPU /,                                   // WebGPU warning
  /GL Driver Message/,
  /GPU stall/,
];

function isFrameworkLine(line: string): boolean {
  return EXCLUDE_PATTERNS.some((re) => re.test(line));
}

async function captureBootConsole(page: Page): Promise<ConsoleLine[]> {
  const lines: ConsoleLine[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    lines.push({ type: msg.type(), text: msg.text() });
  });
  // Iter 35: single-plant 자동 진입 (URL hash 무관). quality 즉시 적용.
  await page.goto('/?quality=2', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // SkinMesh toggle on (Iter 35 baseline 시각 동일)
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
  });
  await page.waitForTimeout(3000);
  return lines;
}

test.describe('Phase L6 — Production silence (Iter 35 갱신)', () => {
  test('PRODUCTION-LOG-COUNT-01: boot console output ≤ 3 lines (Iter 35 — ProgressiveLoad 제거)', async ({ page }) => {
    test.setTimeout(60_000);

    const all = await captureBootConsole(page);
    const productionLines = all
      .map((l) => l.text)
      .filter((t) => !isFrameworkLine(t));

    // eslint-disable-next-line no-console
    console.log(`\n========== Production console lines (filtered): ${productionLines.length} ==========`);
    for (const t of productionLines) {
      // eslint-disable-next-line no-console
      console.log(`  ${t.slice(0, 120)}`);
    }

    // Iter 35: ProgressiveLoad 제거 → [progressive] complete 라인 부재.
    // threshold: 3 lines 이하 (warn/error만 — Babylon 부수 메시지 buffer 1~2건 허용).
    expect(productionLines.length, `boot console lines should be ≤ 3, got:\n${productionLines.join('\n')}`)
      .toBeLessThanOrEqual(3);
  });

  test('PRODUCTION-PROGRESSIVE-REMOVED-01: [progressive] complete 라인 0건 (Iter 35 — 제거됨)', async ({ page }) => {
    test.setTimeout(60_000);

    const all = await captureBootConsole(page);
    const progressiveComplete = all.filter((l) =>
      l.text.includes('[progressive]') && l.text.includes('complete')
    );

    expect(progressiveComplete.length, '[progressive] complete 라인 0건 (ProgressiveLoad archived)')
      .toBe(0);
  });
});
