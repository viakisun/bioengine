import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = resolve(ROOT, 'public/textures/fruit/tomato_roughness_512.png');
const NORMAL_OUT = resolve(ROOT, 'public/textures/fruit/tomato_micro_normal.png');
const DEBUG_OUT = resolve(ROOT, 'public/textures/fruit/tomato_roughness_debug_checker.png');
const SIZE = 512;
const SEED = 11042;

function fract(v) {
  return v - Math.floor(v);
}

function hash2(x, y, salt = 0) {
  return fract(Math.sin((x * 127.1 + y * 311.7 + salt * 74.7 + SEED) * 0.0174533) * 43758.5453);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, scale, salt) {
  const px = x * scale;
  const py = y * scale;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = smoothstep(0, 1, px - ix);
  const fy = smoothstep(0, 1, py - iy);
  const a = hash2(ix, iy, salt);
  const b = hash2(ix + 1, iy, salt);
  const c = hash2(ix, iy + 1, salt);
  const d = hash2(ix + 1, iy + 1, salt);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

function roughnessAt(u, v) {
  const low = valueNoise(u, v, 4.2, 1) - 0.5;
  const mid = valueNoise(u, v, 13.0, 2) - 0.5;
  const fine = valueNoise(u, v, 92.0, 3) - 0.5;
  const verticalStreak =
    Math.sin((u * 28.0 + valueNoise(u, v, 11.0, 4) * 2.2) * Math.PI * 2) * 0.016;
  const waxCloud = Math.pow(valueNoise(u, v, 7.5, 5), 1.8) - 0.35;
  const value = 0.535 + low * 0.11 + mid * 0.05 + fine * 0.022 + verticalStreak + waxCloud * 0.04;
  return Math.max(0.42, Math.min(0.72, value));
}

function heightAt(u, v) {
  const pore = valueNoise(u, v, 140.0, 11) - 0.5;
  const grain = valueNoise(u, v, 68.0, 12) - 0.5;
  const streak =
    Math.sin((u * 38.0 + valueNoise(u, v, 14.0, 13) * 1.7 + v * 1.4) * Math.PI * 2) * 0.5;
  const broad = valueNoise(u, v, 8.0, 14) - 0.5;
  return broad * 0.34 + streak * 0.16 + grain * 0.22 + pore * 0.10;
}

function writeRoughness() {
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const r = Math.round(roughnessAt(x / SIZE, y / SIZE) * 255);
      png.data[i + 0] = r;
      png.data[i + 1] = r;
      png.data[i + 2] = r;
      png.data[i + 3] = 255;
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, PNG.sync.write(png));
}

function writeMicroNormal() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const du = 1 / SIZE;
  const dv = 1 / SIZE;
  // Bake a visible but still low-amplitude cuticle normal; runtime material
  // strength remains modest so this breaks highlights without reading as peel.
  const strength = 0.48;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const hL = heightAt((u - du + 1) % 1, v);
      const hR = heightAt((u + du) % 1, v);
      const hD = heightAt(u, (v - dv + 1) % 1);
      const hU = heightAt(u, (v + dv) % 1);
      const dx = (hR - hL) * strength;
      const dy = (hU - hD) * strength;
      const nz = 1;
      const len = Math.hypot(dx, dy, nz) || 1;
      const nx = -dx / len;
      const ny = -dy / len;
      const nzz = nz / len;
      const i = (y * SIZE + x) * 4;
      png.data[i + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      png.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      png.data[i + 2] = Math.round((nzz * 0.5 + 0.5) * 255);
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(NORMAL_OUT, PNG.sync.write(png));
}

function writeDebugChecker() {
  const png = new PNG({ width: SIZE, height: SIZE });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const checker = (Math.floor(x / 64) + Math.floor(y / 64)) % 2;
      const r = checker ? Math.round(0.82 * 255) : Math.round(0.35 * 255);
      png.data[i + 0] = r;
      png.data[i + 1] = r;
      png.data[i + 2] = r;
      png.data[i + 3] = 255;
    }
  }
  writeFileSync(DEBUG_OUT, PNG.sync.write(png));
}

writeRoughness();
writeMicroNormal();
writeDebugChecker();
console.log(`Generated ${OUT}`);
console.log(`Generated ${NORMAL_OUT}`);
console.log(`Generated ${DEBUG_OUT}`);
