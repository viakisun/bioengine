// 빠른 boot trace — page console + LoadingScreen current stage 매 100ms 캡처
import { test } from "@playwright/test";

test('trace boot progress', async ({ page }) => {
  test.setTimeout(120_000);
  const logs: string[] = [];
  page.on('console', m => logs.push(`[${Date.now() - start}ms] ${m.type()}: ${m.text()}`));
  const start = Date.now();
  await page.goto('http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=medium', { waitUntil: 'domcontentloaded' });

  const samples: {ts: number; stage?: string; progress?: number; detail?: string}[] = [];
  for (let i = 0; i < 50; i++) {
    const s = await page.evaluate(() => {
      const w = window as unknown as { __twinStore?: { getState: () => { boot: { currentStage: string; stages: Record<string, { progress: number; detail: string }> } } } };
      const st = w.__twinStore?.getState()?.boot;
      if (!st) return null;
      const cur = st.stages[st.currentStage];
      return { stage: st.currentStage, progress: cur?.progress, detail: cur?.detail };
    });
    if (s) samples.push({ ts: Date.now() - start, ...s });
    if (s?.stage === 'ready') break;
    await page.waitForTimeout(300);
  }
  console.log('SAMPLES:', JSON.stringify(samples, null, 2));
  console.log('LOGS:', logs.filter(l => l.includes('scene:') || l.includes('greenhouse') || l.includes('extra')).join('\n'));
});
