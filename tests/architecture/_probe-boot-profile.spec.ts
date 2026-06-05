// ★ S143 — Boot stage 세부 분해 측정 (shader compile + texture + first frame).
import { test } from '@playwright/test';

test('boot profile breakdown', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('http://localhost:8090/?mode=greenhouse&extraPlants=8&quality=medium', {
    waitUntil: 'domcontentloaded',
  });
  // wait for ready
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __twinStore?: { getState: () => { boot: { currentStage: string } } } };
      return w.__twinStore?.getState()?.boot?.currentStage === 'ready';
    },
    undefined,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(500);

  const profile = await page.evaluate(() => {
    const w = window as unknown as {
      __bootProfile?: {
        events: Array<{ ts: number; name: string }>;
        shader: { count: number; totalMs: number };
        texture: { count: number };
        frame: { firstRenderTs: number | null; renderCount: number };
        executeWhenReady: number | null;
        readinessPoll: Array<{
          ts: number;
          meshNotReady: number;
          textureNotReady: number;
          sampleMeshes: string[];
          sampleTextures: string[];
        }>;
      };
    };
    return w.__bootProfile ?? null;
  });
  if (!profile) { console.log('NO PROFILE'); return; }

  console.log('=== EVENTS ===');
  for (const e of profile.events) console.log(`  ${e.ts.toFixed(0).padStart(6)}ms  ${e.name}`);
  console.log('=== TOTALS ===');
  console.log(`  shader: ${profile.shader.count} compiles, ${profile.shader.totalMs.toFixed(0)}ms total`);
  console.log(`  texture: ${profile.texture.count} created`);
  console.log(`  frame: first ${profile.frame.firstRenderTs?.toFixed(0)}ms, count ${profile.frame.renderCount}`);
  console.log(`  executeWhenReady: ${profile.executeWhenReady?.toFixed(0)}ms`);
  console.log('=== READINESS POLL (구체적 not-ready 항목) ===');
  for (const p of profile.readinessPoll) {
    if (p.meshNotReady === 0 && p.textureNotReady === 0) continue;
    console.log(`  ${p.ts.toFixed(0).padStart(6)}ms  meshes=${p.meshNotReady}  textures=${p.textureNotReady}`);
    if (p.sampleMeshes.length > 0) console.log(`         meshes: ${p.sampleMeshes.join(', ')}`);
    if (p.sampleTextures.length > 0) console.log(`         textures: ${p.sampleTextures.join(', ')}`);
  }
});
