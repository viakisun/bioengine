// Iter 30 Phase 1-Pre — NodeGrowthContext invariants.
//
// Plan §2 (sleepy-growing-pretzel.md):
//   PhytomerNode가 자기 axis context (5 fields) 보유.
//
// Acceptance:
//   NODE-GROWTH-CONTEXT-01: 모든 PhytomerNode에 growthContext 5 필드
//   NODE-GROWTH-CONTEXT-DEFAULT-01: 미설정 시 DEFAULT 사용 — backward compat
//   NODE-GROWTH-CONTEXT-AXIS-ID-01: main='main', side-shoot='side:N' 형식

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_NODE_GROWTH_CONTEXT,
  makeMainAxisGrowthContext,
  makeSideShootGrowthContext,
  assertGrowthContextValid,
  type NodeGrowthContext,
} from '../../packages/tomato-engine/src/growth/NodeGrowthContext';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

async function readSrc(rel: string): Promise<string> {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf-8');
}

test.describe('Iter 30 Phase 1-Pre — NodeGrowthContext (5 fields)', () => {
  test('NODE-GROWTH-CONTEXT-01: schema 5 필드 + DEFAULT + helpers', () => {
    const required: (keyof NodeGrowthContext)[] = [
      'axisId',
      'localStemRadiusMm',
      'axisCapacityFactor',
      'isSideShoot',
      'parentVigorFactor',
    ];
    expect(required.length).toBe(5);
    for (const key of required) {
      expect(DEFAULT_NODE_GROWTH_CONTEXT[key], `DEFAULT.${key} defined`).toBeDefined();
    }
    expect(DEFAULT_NODE_GROWTH_CONTEXT.axisId).toBe('main');
    expect(DEFAULT_NODE_GROWTH_CONTEXT.isSideShoot).toBe(false);
    expect(DEFAULT_NODE_GROWTH_CONTEXT.parentVigorFactor).toBe(1.0);
    expect(DEFAULT_NODE_GROWTH_CONTEXT.axisCapacityFactor).toBe(1.0);

    // Helpers produce well-formed context
    const main = makeMainAxisGrowthContext({ localStemRadiusMm: 8 });
    expect(main.axisId).toBe('main');
    expect(main.isSideShoot).toBe(false);
    expect(main.localStemRadiusMm).toBe(8);

    const side = makeSideShootGrowthContext({
      sideShootIndex: 2,
      localStemRadiusMm: 5,
    });
    expect(side.axisId).toBe('side:2');
    expect(side.isSideShoot).toBe(true);
    expect(side.localStemRadiusMm).toBe(5);
  });

  test('NODE-GROWTH-CONTEXT-DEFAULT-01: backward compat — NodeState.growthContext optional', async () => {
    // NodeState 인터페이스에 growthContext가 optional (?: 포함)
    const text = await readSrc('packages/tomato-engine/src/GrowthModel.ts');
    const nodeStateMatch = text.match(/export interface NodeState\s*\{[\s\S]*?^\}/m);
    expect(nodeStateMatch, 'NodeState interface block').toBeTruthy();
    const block = nodeStateMatch![0];
    expect(block, 'growthContext field').toMatch(/growthContext\?:\s*NodeGrowthContext/);
  });

  test('NODE-GROWTH-CONTEXT-AXIS-ID-01: main / side:N pattern + isSideShoot consistency', () => {
    // main pattern
    const main = makeMainAxisGrowthContext({ localStemRadiusMm: 8 });
    expect(main.axisId).toMatch(/^main$/);
    expect(main.isSideShoot).toBe(false);

    // side:N pattern (0-based)
    for (let i = 0; i < 5; i++) {
      const side = makeSideShootGrowthContext({
        sideShootIndex: i,
        localStemRadiusMm: 5,
      });
      expect(side.axisId).toBe(`side:${i}`);
      expect(side.isSideShoot).toBe(true);
    }

    // assertGrowthContextValid catches mismatches (warn 만 — throw 안 함)
    expect(() => assertGrowthContextValid(main)).not.toThrow();
    expect(() => assertGrowthContextValid(makeSideShootGrowthContext({ sideShootIndex: 0, localStemRadiusMm: 5 }))).not.toThrow();

    // GrowthModel.ts populator wire-in 검증 — main + side-shoot push site 모두 growthContext 채움
    return fs.readFile(path.join(REPO_ROOT, 'packages/tomato-engine/src/GrowthModel.ts'), 'utf-8')
      .then((text) => {
        expect(text, 'makeMainAxisGrowthContext used').toMatch(/makeMainAxisGrowthContext\(/);
        expect(text, 'makeSideShootGrowthContext used').toMatch(/makeSideShootGrowthContext\(/);
        expect(text, 'sideShootIndex propagated').toMatch(/sideShootOrdinal/);
      });
  });
});
