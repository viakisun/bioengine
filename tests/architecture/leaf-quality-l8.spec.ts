// ★ Iter 39 Phase L8 — Leaf Quality Followup invariants.
//
// L8-0 (S68) — potato-leaf botanical reference disambiguation
// L8-1 (S69) — smoothMargin override applied
// L8-2 (S70) — edgeAsymmetry leaf-level + leaflet-level XOR seed-flip
// L8-3a (S71) — lobeNoise mode field support (default 'positive')
// L8-3b (S72) — tomato.json mode 'signed' opt-in
// L8-4 (S73) — serrationEndpointGuardU data + 산식
// L8-5 (S74) — agePresets dead field 명시

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

test.describe('Iter 39 Phase L8 — Leaf Quality Followup', () => {
  test('LEAF-POTATO-LEAF-DISAMBIGUATED-01: potato-leaf botanical reference 명시 (L8-0)', async () => {
    // 사용자 비판 "언제부터 potato-leaf가 됐어... tomato-leaf 겠지..."
    //   potato-leaf는 _토마토_ leaf type (UC ANR — Brandywine 등 cultivar). 감자 잎 아님.
    //   docs/JSDoc/README 명시 검증.

    // 1. LeafSpec.ts JSDoc — 'potato-leaf' key 의미 명시
    const specSrc = await fs.readFile(
      path.join(REPO_ROOT, 'src/scene/leaf/LeafSpec.ts'),
      'utf-8',
    );
    expect(specSrc, 'JSDoc: 토마토 명시').toMatch(/_토마토_/);
    expect(specSrc, 'JSDoc: UC ANR 명시').toMatch(/UC\s*ANR/);
    expect(specSrc, 'JSDoc: not 감자 잎 명시').toMatch(/감자\s*잎이\s*아닙니다|감자\s*잎이\s*아님/);
    expect(specSrc, 'JSDoc: smooth-margin variant 명시').toMatch(/smooth-margin\s*variant/);

    // 2. README.md — agePresets botanical 섹션
    const readme = await fs.readFile(
      path.join(REPO_ROOT, 'src/data/leaf/README.md'),
      'utf-8',
    );
    expect(readme, 'README: agePresets keys 섹션 (L8-0)').toMatch(
      /agePresets.*keys.*botanical/i,
    );
    expect(readme, 'README: 감자 잎이 아닙니다 강조').toMatch(/감자\s*잎이\s*아닙니다/);
    expect(readme, 'README: Brandywine cultivar 인용').toMatch(/Brandywine/);

    // 3. LEAF_PRESETS.md §E 강화 — 감자 잎 아님 명시
    const presetsDoc = await fs.readFile(
      path.join(REPO_ROOT, 'docs/architecture/LEAF_PRESETS.md'),
      'utf-8',
    );
    expect(presetsDoc, 'PRESETS §E: 감자 잎이 아닙니다 강조').toMatch(
      /_감자\s*잎이\s*아닙니다_|감자\s*잎이\s*아닙니다/,
    );
    expect(presetsDoc, 'PRESETS §E: tomato leaf type 분류 명시').toMatch(
      /토마토\s*leaf\s*type\s*분류/,
    );
    expect(presetsDoc, 'PRESETS §E: cultivars 인용').toMatch(/Brandywine.*Pruden|Pruden.*Brandywine/);
  });
});
