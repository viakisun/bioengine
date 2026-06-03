// ★ Iter 39 Phase L4-8 (S36) — LeafEngine architecture invariants.
//
// 5 신규 invariants (원칙 #41-44 검증):
//   LEAF-ENGINE-API-01            — LeafEngine 4 methods 보장
//   LEAF-SPEC-NO-TOMATO-01        — src/scene/leaf/ 코드 안 'tomato' 단어 0
//   LEAF-SPEC-ZOD-VALID-01        — tomato.json이 LeafSpecSchema.parse PASS
//   LEAF-SPEC-BOTANICAL-PARAMETERS-01 — 코드 안 botanical magic numbers 0
//                                        (수학 상수 / EPS / index / 0-1 lerp 허용)
//   LEAF-SPEC-TAXONOMY-01         — spec.taxonomy 4 fields 필수
//
// 검증 전략: 직접 import 대신 fs.readFile + string regex (Babylon dep 회피).
// Zod는 pure (Babylon 무관) — schema는 직접 import.

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { LeafSpecSchema, parseLeafSpec } from '../../src/scene/leaf/LeafSpec';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');
const LEAF_ENGINE_DIR = path.join(REPO_ROOT, 'src/scene/leaf');

async function readEngineFiles(): Promise<Array<{ rel: string; text: string }>> {
  const files = await fs.readdir(LEAF_ENGINE_DIR);
  const out: Array<{ rel: string; text: string }> = [];
  for (const f of files) {
    if (!f.endsWith('.ts')) continue;
    const abs = path.join(LEAF_ENGINE_DIR, f);
    out.push({ rel: `src/scene/leaf/${f}`, text: await fs.readFile(abs, 'utf-8') });
  }
  return out;
}

async function readTomatoJson(): Promise<unknown> {
  const text = await fs.readFile(
    path.join(REPO_ROOT, 'src/data/leaf/specs/tomato.json'),
    'utf-8',
  );
  return JSON.parse(text);
}

test.describe('Iter 39 Phase L4-8 — LeafEngine architecture (원칙 #41-44)', () => {
  test('LEAF-ENGINE-API-01: LeafEngine namespace 4 methods (createLeaf/wrapAsMeshes/getMaterial/getYellowMaterial)', async () => {
    const text = await fs.readFile(
      path.join(LEAF_ENGINE_DIR, 'LeafEngine.ts'),
      'utf-8',
    );
    // LeafEngine object literal에 4 methods 존재 의무
    expect(text, 'createLeaf method').toMatch(/createLeaf\s*\(/);
    expect(text, 'wrapAsMeshes method').toMatch(/wrapAsMeshes\s*\(/);
    expect(text, 'getMaterial method').toMatch(/getMaterial\s*\(/);
    expect(text, 'getYellowMaterial method').toMatch(/getYellowMaterial\s*\(/);

    // export 명시
    expect(text, 'LeafEngine 객체 export').toMatch(/export\s+const\s+LeafEngine\s*=/);
    expect(text, 'CreateLeafOptions interface export').toMatch(/export\s+interface\s+CreateLeafOptions/);
  });

  test('LEAF-SPEC-NO-TOMATO-01: src/scene/leaf/ engine 코드 안 "tomato" 단어 0 (원칙 #42)', async () => {
    // engine purity. plant identifier ('tomato.json')는 caller + data layer 에만.
    //
    // Scope:
    //   - Comments 제외 (// or /** */)
    //   - 'tomato' as botanical identifier (variable name, runtime string,
    //     logic) 금지.
    //   - @farmsim/tomato-* package imports 허용 (packages는 historically
    //     named, expose plant-agnostic primitives — package rename은 별도 작업).
    //   - 'commonName: 'tomato'' string literal in schema/example 제외
    //     (LeafSpec.ts의 comment-like example 표기는 schema docs).
    const files = await readEngineFiles();
    const tomatoRe = /\btomato\b/i;
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const { rel, text } of files) {
      const lines = text.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // strip block comments
        if (line.includes('/*')) inBlockComment = true;
        const isCommentLine = inBlockComment || /^\s*(\/\/|\*)/.test(line);
        if (line.includes('*/')) inBlockComment = false;
        if (isCommentLine) continue;
        // strip trailing line comment from the line
        const codePart = line.replace(/\/\/.*$/, '');
        if (!tomatoRe.test(codePart)) continue;
        // allow @farmsim/tomato-* package imports
        if (/@farmsim\/tomato-(engine|geometry|growth)/.test(codePart)) continue;
        offenders.push({ file: rel, line: i + 1, text: line.trim() });
      }
    }
    expect(
      offenders,
      `engine 코드 (src/scene/leaf/*.ts) 안 'tomato' 단어 0 의무 (원칙 #42).\n` +
        `Found: ${JSON.stringify(offenders, null, 2)}\n` +
        `해결: data layer (src/data/leaf/) 로 이동 또는 caller (application code) 로 이동.`,
    ).toEqual([]);
  });

  test('LEAF-SPEC-ZOD-VALID-01: tomato.json이 LeafSpecSchema.parse PASS', async () => {
    // 원칙 #43 — Spec runtime validation. JSON 편집 mistake catch.
    const rawJson = await readTomatoJson();
    expect(() => LeafSpecSchema.parse(rawJson), 'tomato.json schema parse').not.toThrow();
    const parsed = parseLeafSpec(rawJson);
    expect(parsed.schemaVersion).toBe('1.1');
    expect(parsed.taxonomy.commonName).toBe('tomato');
    // cross-field constraint 확인 (terminal.lobeDepth >= intercalary.lobeDepth)
    expect(parsed.profileByPosition.terminal.lobeDepth).toBeGreaterThanOrEqual(
      parsed.profileByPosition.intercalary.lobeDepth,
    );
  });

  test('LEAF-SPEC-BOTANICAL-PARAMETERS-01: 코드 안 botanical magic 0 (수학/EPS/index 허용, 원칙 #41)', async () => {
    // Code = formula, Data = parameter.
    //
    // 금지 (botanical magic — JSON에 있어야 함):
    //   - correlation 산식 magic (10+c*18, 0.02+c*0.06)
    //   - L0-D-1 foldDroopDeg 산식 (-5 + 15*maturity)
    //
    // 허용:
    //   - 수학 상수 (Math.PI, Math.E)
    //   - Float EPS (1e-5, 1e-6, 1e-9)
    //   - Array index / loop bound (0, 1, length)
    //   - clamp/lerp 0~1
    const files = await readEngineFiles();
    const forbiddenPatterns = [
      { re: /\b10\s*\+\s*c\s*\*\s*18\b/, name: 'serration freq 산식 hardcoded (10 + c * 18)' },
      { re: /\b0\.02\s*\+\s*c\s*\*\s*0\.06\b/, name: 'asymmetry 산식 hardcoded (0.02 + c * 0.06)' },
      { re: /-5\s*\+\s*15\s*\*\s*maturity/, name: 'foldDroopDeg 산식 hardcoded (-5 + 15 * maturity)' },
    ];
    const offenders: Array<{ file: string; pattern: string; line: number; text: string }> = [];
    for (const { rel, text } of files) {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        for (const { re, name } of forbiddenPatterns) {
          if (re.test(line)) {
            offenders.push({ file: rel, pattern: name, line: i + 1, text: line.trim() });
          }
        }
      }
    }
    expect(
      offenders,
      `botanical magic numbers must be in src/data/leaf/specs/tomato.json, not engine code (원칙 #41).`,
    ).toEqual([]);
  });

  test('LEAF-SPEC-TAXONOMY-01: spec.taxonomy 4 fields 필수 (multi-crop, 원칙 #44)', async () => {
    const rawJson = await readTomatoJson();
    const parsed = parseLeafSpec(rawJson);
    expect(parsed.taxonomy).toBeDefined();
    expect(parsed.taxonomy.family, 'family 필수').toBeTruthy();
    expect(parsed.taxonomy.genus, 'genus 필수').toBeTruthy();
    expect(parsed.taxonomy.species, 'species 필수').toBeTruthy();
    expect(parsed.taxonomy.commonName, 'commonName 필수').toBeTruthy();
    // tomato 값 검증 (data layer)
    expect(parsed.taxonomy.family).toBe('Solanaceae');
    expect(parsed.taxonomy.genus).toBe('Solanum');
    expect(parsed.taxonomy.species).toBe('lycopersicum');
  });
});
