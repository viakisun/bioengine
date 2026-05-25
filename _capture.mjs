// iter19 — 다각도 close-up sweep
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const iter = process.argv[2] || 'iter19';
const outDir = `/tmp/skinmesh-shots/${iter}`;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('skinplant') || m.type() === 'error') {
    process.stdout.write(`[page] ${t}\n`);
  }
});

await page.goto('http://localhost:8090/#single-plant', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('canvas');
await page.waitForTimeout(4000);

async function shot(label) {
  await page.screenshot({ path: `${outDir}/${label}.png` });
  process.stdout.write(`📷 ${label}\n`);
}
async function setMinute(minute) {
  await page.evaluate((m) => {
    const range = document.querySelector('input[type="range"]');
    if (!range) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(range, String(m));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  }, minute);
  await page.waitForTimeout(2500);
}
async function setSkin(on) {
  await page.evaluate((v) => window.__twinStore?.getState?.()?.setUseImplicitMesh?.(v), on);
  await page.waitForTimeout(on ? 2000 : 1200);
}
async function aim({ target = [0, 1.8, 0], radius = 1.5, alpha = -1.57, beta = 1.3 } = {}) {
  await page.evaluate(({ t, r, a, b }) => {
    const cam = window.__camera;
    if (!cam) return;
    if (cam.target?.copyFromFloats) cam.target.copyFromFloats(t[0], t[1], t[2]);
    cam.radius = r; cam.alpha = a; cam.beta = b;
  }, { t: target, r: radius, a: alpha, b: beta });
  await page.waitForTimeout(350);
}

await setMinute(50 * 24 * 60);   // day 50 — well-developed plant
await setSkin(true);

// === 1. 360° 회전 (alpha sweep) — 전체 plant 중심에서 8 directions ===
const center = [0, 1.5, 0];
const R_FULL = 1.5;
for (let i = 0; i < 8; i++) {
  const alpha = -Math.PI / 2 + (i / 8) * Math.PI * 2;
  await aim({ target: center, radius: R_FULL, alpha, beta: 1.3 });
  await shot(`A_360_${i.toString().padStart(2, '0')}`);
}

// === 2. 높이별 (low / mid / high) ===
for (const [name, t, b] of [
  ['low',  [0, 0.6, 0], 1.4],
  ['mid',  [0, 1.5, 0], 1.3],
  ['high', [0, 2.4, 0], 1.2],
]) {
  await aim({ target: t, radius: 0.9, alpha: -1.57, beta: b });
  await shot(`B_height_${name}`);
}

// === 3. 위/아래에서 ===
await aim({ target: center, radius: 1.5, alpha: -1.57, beta: 0.4 });
await shot('C_topdown');
await aim({ target: center, radius: 1.5, alpha: -1.57, beta: 0.15 });
await shot('C_topdown_steep');
await aim({ target: center, radius: 1.2, alpha: -1.57, beta: 2.0 });
await shot('C_lookup');
await aim({ target: center, radius: 1.0, alpha: -1.57, beta: 2.4 });
await shot('C_below');

// === 4. main stem 따라 close-up 4 높이 ===
for (const [name, y] of [['base', 1.05], ['lower', 1.5], ['upper', 2.0], ['top', 2.6]]) {
  await aim({ target: [0, y, 0], radius: 0.18, alpha: -1.57, beta: 1.3 });
  await shot(`D_mainstem_${name}`);
}

// === 5. 분기점 close-up — main stem 다양한 높이 ===
for (let i = 0; i < 6; i++) {
  const y = 1.2 + i * 0.25;
  await aim({ target: [0, y, 0], radius: 0.25, alpha: -1.57, beta: 1.3 });
  await shot(`E_junction_y${y.toFixed(2)}`);
}

// === 6. 분기점 회전 (한 junction에서 다른 각도) ===
const junctionT = [0, 1.7, 0];
for (let i = 0; i < 6; i++) {
  const alpha = -Math.PI / 2 + (i / 6) * Math.PI * 2;
  await aim({ target: junctionT, radius: 0.30, alpha, beta: 1.3 });
  await shot(`F_junction_rot_${i}`);
}

// === 7. truss/fruit cluster ===
for (const [name, t, r] of [
  ['truss_close', [-0.1, 1.5, 0], 0.30],
  ['fruit_pedicel', [-0.05, 1.6, 0], 0.20],
  ['fruit_body', [-0.05, 1.65, 0], 0.15],
]) {
  await aim({ target: t, radius: r, alpha: -1.57, beta: 1.3 });
  await shot(`G_${name}`);
}

// === 8. 측면 view (alpha 변화 + beta 약간 위) ===
for (let i = 0; i < 4; i++) {
  const alpha = -Math.PI / 2 - 0.4 + i * 0.2;
  await aim({ target: center, radius: 0.7, alpha, beta: 1.2 });
  await shot(`H_side_${i}`);
}

// === 9. Showcase OFF compare (같은 pose 3개) ===
await setSkin(false);
for (const [name, t, r] of [
  ['compare_full',  [0, 1.5, 0], 1.5],
  ['compare_close', [0, 1.7, 0], 0.6],
  ['compare_junction', [0, 1.7, 0], 0.30],
]) {
  await aim({ target: t, radius: r, alpha: -1.57, beta: 1.3 });
  await shot(`I_OFF_${name}`);
}
await setSkin(true);
for (const [name, t, r] of [
  ['compare_full',  [0, 1.5, 0], 1.5],
  ['compare_close', [0, 1.7, 0], 0.6],
  ['compare_junction', [0, 1.7, 0], 0.30],
]) {
  await aim({ target: t, radius: r, alpha: -1.57, beta: 1.3 });
  await shot(`I_ON_${name}`);
}

process.stdout.write(`\n✓ ${outDir}\n`);
await browser.close();
