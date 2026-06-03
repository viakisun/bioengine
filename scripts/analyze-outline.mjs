// L9-D V2 outline 정량 분석 (S107 debug panel 데이터 직접 분석).
// 사용: node scripts/analyze-outline.mjs

import { readFileSync } from 'fs';

// V2 산식 (LeafMeshBuilder2.ts 재현)
function signedRand(seed, salt) {
  const h = (seed * 7919 + salt * 31 + 49297) >>> 0;
  return ((h % 2000) / 1000) - 1;
}

function perturbLobes(lobes, idSeed, saltBase, samples) {
  const minSigma = 1 / samples;
  return lobes.map((lobe, i) => {
    const uShift = signedRand(idSeed, saltBase + i * 7) * 0.04;
    const depthMult = 1 + signedRand(idSeed, saltBase + i * 11 + 3) * 0.25;
    const sigmaMult = 1 + signedRand(idSeed, saltBase + i * 13 + 5) * 0.15;
    return {
      u: Math.max(0.05, Math.min(0.95, lobe.u + uShift)),
      depth: Math.max(0, lobe.depth * depthMult),
      sigma: Math.max(minSigma, (lobe.sigma ?? 0.06) * sigmaMult),
    };
  });
}

function shoulderLobeBumps(u, lobes) {
  let bump = 0;
  for (const { u: ui, depth: di, sigma: si = 0.06 } of lobes) {
    bump += di * Math.exp(-((u - ui) ** 2) / (2 * si * si));
  }
  return bump;
}

function notchDents(u, notches) {
  let dent = 0;
  for (const { u: ui, depth: di, sigma: si = 0.04 } of notches) {
    dent += di * Math.exp(-((u - ui) ** 2) / (2 * si * si));
  }
  return dent;
}

function baseWidthV2(u, shapePower, dripTipUStart, dripTipDepth) {
  let s = Math.pow(Math.max(0, Math.sin(Math.PI * u)), shapePower);
  if (u >= dripTipUStart && dripTipDepth > 0) {
    const tu = (u - dripTipUStart) / Math.max(1e-6, 1 - dripTipUStart);
    s *= 1 - dripTipDepth * tu * tu;
  }
  return Math.max(0, s);
}

function buildProfile(spec, position, idSeed, lengthM) {
  const p = spec.profileByPosition[position];
  const samples = 40;
  const halfWidthBase = lengthM / Math.max(1, 1 / p.widthRatio) / 2;
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));
  const scaledLobes = (p.shoulderLobes ?? []).map(l => ({ ...l, depth: l.depth * lobeDepthMult }));
  const scaledNotches = (p.sinusNotches ?? []).map(n => ({ ...n, depth: n.depth * lobeDepthMult }));

  const expansionLobeScale = 1.0;
  const senescenceLobeScale = 1.0;
  const finalLobeScale = expansionLobeScale * senescenceLobeScale;

  const lobesLeft = perturbLobes(scaledLobes, idSeed, 101, samples);
  const lobesRight = perturbLobes(scaledLobes, idSeed, 313, samples);
  const notchesLeft = perturbLobes(scaledNotches, idSeed, 211, samples);
  const notchesRight = perturbLobes(scaledNotches, idSeed, 419, samples);

  const baseTransitionEndU = spec.shapeProfileRules.baseTransitionEndU;
  const baseShape = 0.85;
  const dripTipUStart = p.dripTipUStart ?? 0.85;
  const dripTipDepth = p.dripTipDepth ?? 0.6;
  const tipSharpness = p.tipSharpness;

  const result = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const base = baseWidthV2(u, tipSharpness, dripTipUStart, dripTipDepth);
    const baseFactor = u < baseTransitionEndU
      ? 1 - (1 - baseShape) * (1 - u / Math.max(1e-6, baseTransitionEndU))
      : 1;
    const outwardL = shoulderLobeBumps(u, lobesLeft) * finalLobeScale;
    const outwardR = shoulderLobeBumps(u, lobesRight) * finalLobeScale;
    const inwardL = notchDents(u, notchesLeft) * finalLobeScale;
    const inwardR = notchDents(u, notchesRight) * finalLobeScale;
    const wL = Math.max(0, (base + outwardL - inwardL) * halfWidthBase * baseFactor);
    const wR = Math.max(0, (base + outwardR - inwardR) * halfWidthBase * baseFactor);
    result.push({ u, hL: wL, hR: wR });
  }
  return result;
}

// JSON 부분만 추출 (json은 JSON5/comments 없으므로 그대로)
const raw = readFileSync('src/data/leaf/specs/tomato.json', 'utf-8');
const spec = JSON.parse(raw);

const POSITIONS = ['terminal', 'primary', 'intercalary', 'secondary'];
const SEEDS = [1001, 2031, 3149, 4017, 5083, 6211, 7079, 8137, 9223, 10331, 11409, 12527];
const LENGTH_M = 0.15;  // 15cm primary

console.log('\n=== L9-D V2 Outline 정량 분석 (lengthM=15cm) ===\n');

for (const pos of POSITIONS) {
  console.log(`\n[${pos}]`);
  const profiles = SEEDS.map(s => buildProfile(spec, pos, s, LENGTH_M));

  // 1. max halfWidth (잎 폭) 분산 (variation)
  const maxHW = profiles.map(p => Math.max(...p.map(s => (s.hL + s.hR) / 2)));
  const maxHWMean = maxHW.reduce((a, b) => a + b, 0) / maxHW.length;
  const maxHWStd = Math.sqrt(maxHW.reduce((s, v) => s + (v - maxHWMean) ** 2, 0) / maxHW.length);
  const cv = maxHWStd / maxHWMean;
  console.log(`  max halfWidth mean=${(maxHWMean*100).toFixed(2)}cm std=${(maxHWStd*100).toFixed(3)}cm CV=${(cv*100).toFixed(1)}%`);

  // 2. 좌우 비대칭 (|hL - hR| 평균)
  const asymDiffs = profiles.map(p => {
    const diffs = p.map(s => Math.abs(s.hL - s.hR));
    return diffs.reduce((a, b) => a + b, 0) / diffs.length;
  });
  const asymMean = asymDiffs.reduce((a, b) => a + b, 0) / asymDiffs.length;
  const asymPct = asymMean / maxHWMean * 100;
  console.log(`  좌우 비대칭 (|hL-hR| 평균) = ${(asymMean*1000).toFixed(2)}mm (${asymPct.toFixed(1)}% of max halfWidth)`);

  // 3. lobe peak count (대략 — local maxima count, 한 outline)
  // first seed만 sample
  const p0 = profiles[0];
  const hW0 = p0.map(s => (s.hL + s.hR) / 2);
  let peaks = 0;
  for (let i = 1; i < hW0.length - 1; i++) {
    if (hW0[i] > hW0[i-1] && hW0[i] > hW0[i+1]) peaks++;
  }
  console.log(`  seed0 outline local max count = ${peaks} (lobe peak count proxy)`);

  // 4. 12 seed의 _shape_ 다양성 — 각 sample u에서 halfWidth 분산
  let totalVariance = 0;
  for (let i = 0; i < profiles[0].length; i++) {
    const hWs = profiles.map(p => (p[i].hL + p[i].hR) / 2);
    const mean = hWs.reduce((a, b) => a + b, 0) / hWs.length;
    const variance = hWs.reduce((s, v) => s + (v - mean) ** 2, 0) / hWs.length;
    totalVariance += Math.sqrt(variance);
  }
  const avgPointStd = totalVariance / profiles[0].length;
  const stdPct = avgPointStd / maxHWMean * 100;
  console.log(`  12 seed avg point std-dev = ${(avgPointStd*1000).toFixed(2)}mm (${stdPct.toFixed(1)}% of max halfWidth)`);
}

console.log('\n해석:');
console.log('  - max halfWidth CV: 12 seed _크기 차이_. 1%=거의 같음, 5%+=눈에 띔.');
console.log('  - 좌우 비대칭: 5%+=가시, 10%+=명확 비대칭.');
console.log('  - lobe peak count: terminal 3-5개 자연.');
console.log('  - 12 seed point std: 3%+=충분히 다른 outline.\n');
