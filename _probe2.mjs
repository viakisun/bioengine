import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto('http://localhost:8090/#single-plant', { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const scene = window.__scene;
  const cam = window.__camera;
  if (!scene) return { error: 'no scene' };
  const meshes = scene.meshes ?? [];
  const showcase = meshes.filter(m => m.name?.startsWith('showcase_'));
  const skinplant = meshes.filter(m => m.name?.startsWith('skinplant_'));
  // Find showcase root TransformNode
  const showcaseRoot = scene.transformNodes?.find(n => n.name?.startsWith('showcase_') && !n.name.includes('lush'));
  return {
    sceneOk: !!scene,
    camTarget: cam ? [cam.target?.x, cam.target?.y, cam.target?.z] : null,
    camRadius: cam?.radius,
    camAlpha: cam?.alpha,
    camBeta: cam?.beta,
    showcaseRootPos: showcaseRoot ? [showcaseRoot.position?.x, showcaseRoot.position?.y, showcaseRoot.position?.z] : null,
    showcaseRootName: showcaseRoot?.name,
    showcaseMeshCount: showcase.length,
    skinplantMeshCount: skinplant.length,
    sampleShowcaseMesh: showcase[0]?.name,
    showcaseBbox: showcase.length > 0 ? (() => {
      const m = showcase[0];
      try {
        m.refreshBoundingInfo?.(false, false);
        const b = m.getBoundingInfo?.()?.boundingBox;
        return b ? { min: [b.minimumWorld.x, b.minimumWorld.y, b.minimumWorld.z], max: [b.maximumWorld.x, b.maximumWorld.y, b.maximumWorld.z] } : null;
      } catch { return null; }
    })() : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
