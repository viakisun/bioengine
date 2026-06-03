// L9-D V2 S108 — 10 sample 정량 분석.
// 사용: node scripts/analyze-samples.mjs

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

// Sample data (LeafMeshBuilder2 에서 추출)
const SAMPLES = [
  { name: '0. Terminal elaborate', aspect: 2.2, tip: 1.05,
    s: [{u:0.20,d:0.40,sig:0.04},{u:0.40,d:0.60,sig:0.04},{u:0.60,d:0.50,sig:0.04},{u:0.80,d:0.30,sig:0.035}],
    n: [{u:0.30,d:0.30,sig:0.03},{u:0.50,d:0.45,sig:0.03},{u:0.70,d:0.35,sig:0.03}],
    dripU: 0.88, dripD: 0.35 },
  { name: '1. Primary broad', aspect: 1.8, tip: 1.10,
    s: [{u:0.25,d:0.50,sig:0.05},{u:0.55,d:0.55,sig:0.05},{u:0.78,d:0.25,sig:0.04}],
    n: [{u:0.40,d:0.35,sig:0.04},{u:0.68,d:0.25,sig:0.03}],
    dripU: 0.85, dripD: 0.30 },
  { name: '2. Sub-lobed', aspect: 2.0, tip: 1.05,
    s: [{u:0.15,d:0.20,sig:0.025},{u:0.30,d:0.45,sig:0.03},{u:0.45,d:0.30,sig:0.025},{u:0.60,d:0.50,sig:0.03},{u:0.75,d:0.35,sig:0.025},{u:0.88,d:0.18,sig:0.025}],
    n: [{u:0.22,d:0.18,sig:0.025},{u:0.37,d:0.35,sig:0.025},{u:0.52,d:0.20,sig:0.025},{u:0.68,d:0.40,sig:0.025},{u:0.82,d:0.25,sig:0.025}],
    dripU: 0.90, dripD: 0.30 },
  { name: '3. Long pointed', aspect: 2.8, tip: 1.15,
    s: [{u:0.30,d:0.45,sig:0.05},{u:0.60,d:0.40,sig:0.05}],
    n: [{u:0.45,d:0.30,sig:0.04}],
    dripU: 0.78, dripD: 0.55 },
  { name: '4. Asym left-heavy', aspect: 2.0, tip: 1.05,
    s: [{u:0.22,d:0.55,sig:0.04},{u:0.55,d:0.50,sig:0.04},{u:0.78,d:0.30,sig:0.04}],
    n: [{u:0.40,d:0.40,sig:0.03},{u:0.66,d:0.30,sig:0.03}],
    sR: [{u:0.45,d:0.30,sig:0.05},{u:0.75,d:0.20,sig:0.04}],
    nR: [{u:0.30,d:0.15,sig:0.04}],
    dripU: 0.85, dripD: 0.35 },
  { name: '5. Asym right-heavy', aspect: 2.0, tip: 1.05,
    s: [{u:0.45,d:0.30,sig:0.05},{u:0.75,d:0.20,sig:0.04}],
    n: [{u:0.30,d:0.15,sig:0.04}],
    sR: [{u:0.22,d:0.55,sig:0.04},{u:0.55,d:0.50,sig:0.04},{u:0.78,d:0.30,sig:0.04}],
    nR: [{u:0.40,d:0.40,sig:0.03},{u:0.66,d:0.30,sig:0.03}],
    dripU: 0.85, dripD: 0.35 },
  { name: '6. Simple small', aspect: 1.5, tip: 1.05,
    s: [{u:0.50,d:0.20,sig:0.07}],
    n: [],
    dripU: 0.92, dripD: 0.20 },
  { name: '7. Deep cleavage', aspect: 2.0, tip: 1.05,
    s: [{u:0.25,d:0.55,sig:0.04},{u:0.55,d:0.55,sig:0.04},{u:0.80,d:0.40,sig:0.04}],
    n: [{u:0.40,d:0.60,sig:0.03},{u:0.68,d:0.50,sig:0.03}],
    dripU: 0.88, dripD: 0.30 },
  { name: '8. Apex emphasis', aspect: 2.2, tip: 1.10,
    s: [{u:0.35,d:0.20,sig:0.05},{u:0.60,d:0.50,sig:0.04},{u:0.82,d:0.40,sig:0.04}],
    n: [{u:0.50,d:0.20,sig:0.04},{u:0.72,d:0.40,sig:0.03}],
    dripU: 0.90, dripD: 0.40 },
  { name: '9. Mid-bulged', aspect: 1.8, tip: 1.05,
    s: [{u:0.45,d:0.65,sig:0.06}],
    n: [{u:0.65,d:0.30,sig:0.04}],
    dripU: 0.85, dripD: 0.30 },
];

function buildProfile(sample, idSeed, lengthM) {
  const samples = 40;
  const halfWidthBase = lengthM / Math.max(1, sample.aspect) / 2;
  const lobeDepthMult = Math.max(0.2, Math.min(1.0, lengthM / 0.20));
  const sLobes = sample.s.map(l => ({u:l.u,depth:l.d*lobeDepthMult,sigma:l.sig}));
  const sNotches = sample.n.map(l => ({u:l.u,depth:l.d*lobeDepthMult,sigma:l.sig}));
  const sLobesR = sample.sR?.map(l => ({u:l.u,depth:l.d*lobeDepthMult,sigma:l.sig})) ?? sLobes;
  const sNotchesR = sample.nR?.map(l => ({u:l.u,depth:l.d*lobeDepthMult,sigma:l.sig})) ?? sNotches;

  const lobesL = perturbLobes(sLobes, idSeed, 101, samples);
  const lobesR = perturbLobes(sLobesR, idSeed, 313, samples);
  const notchesL = perturbLobes(sNotches, idSeed, 211, samples);
  const notchesR = perturbLobes(sNotchesR, idSeed, 419, samples);

  const baseShape = 0.85;
  const baseTransitionEndU = 0.25;

  const result = [];
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    const base = baseWidthV2(u, sample.tip, sample.dripU, sample.dripD);
    const bF = u < baseTransitionEndU ? 1 - (1 - baseShape) * (1 - u / baseTransitionEndU) : 1;
    const oL = shoulderLobeBumps(u, lobesL);
    const oR = shoulderLobeBumps(u, lobesR);
    const iL = notchDents(u, notchesL);
    const iR = notchDents(u, notchesR);
    const wL = Math.max(0, (base + oL - iL) * halfWidthBase * bF);
    const wR = Math.max(0, (base + oR - iR) * halfWidthBase * bF);
    result.push({ u, hL: wL, hR: wR });
  }
  return result;
}

console.log('\n=== S108 10 Sample 정량 분석 (lengthM=15cm, 12 seed each) ===\n');

const LENGTH_M = 0.15;
const SEEDS_PER = 12;

const allMaxHWs = [];
let totalAsym = 0, totalAsymCnt = 0;

for (const sample of SAMPLES) {
  const profiles = [];
  for (let s = 0; s < SEEDS_PER; s++) {
    profiles.push(buildProfile(sample, s * 1001 + 17, LENGTH_M));
  }
  const maxHWs = profiles.map(p => Math.max(...p.map(s => (s.hL + s.hR) / 2)));
  const meanMax = maxHWs.reduce((a, b) => a + b, 0) / maxHWs.length;
  allMaxHWs.push(meanMax);

  // 좌우 비대칭
  let asymSum = 0, asymCnt = 0;
  for (const p of profiles) {
    for (const s of p) {
      asymSum += Math.abs(s.hL - s.hR);
      asymCnt++;
    }
  }
  const asymMean = asymSum / asymCnt;
  totalAsym += asymSum;
  totalAsymCnt += asymCnt;

  // peak count
  const p0 = profiles[0];
  const hW0 = p0.map(s => (s.hL + s.hR) / 2);
  let peaks = 0;
  for (let i = 1; i < hW0.length - 1; i++) {
    if (hW0[i] > hW0[i-1] && hW0[i] > hW0[i+1]) peaks++;
  }

  console.log(`${sample.name.padEnd(28)} | max=${(meanMax*100).toFixed(2)}cm | 비대칭=${(asymMean*1000).toFixed(2)}mm (${(asymMean/meanMax*100).toFixed(1)}%) | peaks=${peaks}`);
}

// 전체 sample간 outline _차이_
const allMaxMean = allMaxHWs.reduce((a, b) => a + b, 0) / allMaxHWs.length;
const allMaxStd = Math.sqrt(allMaxHWs.reduce((s, v) => s + (v - allMaxMean) ** 2, 0) / allMaxHWs.length);
const cvBetween = allMaxStd / allMaxMean * 100;

const totalAsymMean = totalAsym / totalAsymCnt;
const totalAsymPct = totalAsymMean / allMaxMean * 100;

console.log(`\n전체:`);
console.log(`  10 sample 평균 max halfWidth = ${(allMaxMean*100).toFixed(2)}cm, std=${(allMaxStd*100).toFixed(2)}cm, CV=${cvBetween.toFixed(1)}%`);
console.log(`  10 sample 평균 좌우 비대칭 = ${(totalAsymMean*1000).toFixed(2)}mm (${totalAsymPct.toFixed(1)}%)`);
console.log(`\n해석:`);
console.log(`  - sample간 CV (크기 다양성): 10%+ = 매우 다양, 5-10% = 적정, <5% = 부족`);
console.log(`  - 좌우 비대칭: 5%+ = 가시, 10%+ = 명확, 20%+ = 매우 비대칭\n`);
