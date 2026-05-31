// Phase L6 — Production silence verification.
//
// Boot 출력이 _기본_ silent (1~3 lines)임을 page.on('console')로 자동 검증.
//
// Plan SSOT: `.claude/plans/sleepy-growing-pretzel.md` §8.2

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
  // quality=2 — progressive complete까지 ~6s + buffer
  await page.goto('/?quality=2', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // single-plant 진입 (progressive complete까지)
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setMode('single-plant');
    w.__twinStore?.getState().setUseImplicitMesh(false);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as {
      __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } };
    };
    w.__twinStore?.getState().setUseImplicitMesh(true);
  });
  // progressive complete까지 (quality=2 → env-only/skeleton-on/lush + quality-2 = 4 stages × 2s + buffer)
  await page.waitForTimeout(12_000);
  return lines;
}

test.describe('Phase L6 — Production silence', () => {
  test('PRODUCTION-LOG-COUNT-01: boot console output ≤ 5 lines (default opt-in off)', async ({ page }) => {
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

    // 기대: [progressive] complete 1줄 + (warn 있을 시 1~3건)
    // threshold: 5 lines 이하 (flaky 방지 — Babylon 메시지가 가끔 잡힘)
    expect(productionLines.length, `boot console lines should be ≤ 5, got:\n${productionLines.join('\n')}`)
      .toBeLessThanOrEqual(5);
  });

  test('PRODUCTION-PROGRESSIVE-COMPLETE-01: [progressive] complete 1줄 출력 확인', async ({ page }) => {
    test.setTimeout(60_000);

    const all = await captureBootConsole(page);
    const progressiveComplete = all.filter((l) =>
      l.text.includes('[progressive]') && l.text.includes('complete')
    );

    expect(progressiveComplete.length, '[progressive] complete 라인 정확히 1개')
      .toBe(1);
  });
});
