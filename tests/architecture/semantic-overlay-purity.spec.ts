// SSOT #187 원칙 2 — SemanticOverlay purity invariant.
//
// Iter 26 PR 4-2: SemanticOverlay.ts must NOT contain hex color literals.
// All colors come from graph node.visualHint / edge.renderPolicy.visualHint /
// organAnchor.visualHint. Style changes happen in the populator
// (visualHintDefaults.ts), not in the overlay.
//
// This is a static-file invariant — runs as a unit test, no browser needed.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = process.cwd();
const OVERLAY_PATH = join(REPO_ROOT, 'src/twin/SemanticOverlay.ts');

const HEX_LITERAL = /#[0-9a-fA-F]{6}\b/;

test.describe('SemanticOverlay Purity (SSOT #187 원칙 2)', () => {
  test('SEMOV-01: SemanticOverlay.ts contains zero hardcoded hex colors', async () => {
    const content = readFileSync(OVERLAY_PATH, 'utf-8');
    const lines = content.split('\n');
    const violations: { line: number; text: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip pure comment lines so docstrings can explain color examples.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      // ignore strings inside ts.cli flags etc. for now — overlay shouldn't have any.
      if (HEX_LITERAL.test(line)) {
        violations.push({ line: i + 1, text: line.trim() });
      }
    }
    expect(
      violations,
      `SemanticOverlay.ts must not hardcode colors (원칙 2). Move to visualHintDefaults.ts:\n` +
        violations.map((v) => `  L${v.line}: ${v.text}`).join('\n'),
    ).toEqual([]);
  });
});
