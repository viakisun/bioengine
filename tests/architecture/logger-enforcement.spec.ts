// Phase L6 — Logger enforcement (production console 직접 호출 금지).
//
// Plan SSOT: `.claude/plans/sleepy-growing-pretzel.md` §8.1
// Docs:      `docs/architecture/LOGGING.md`

import { test, expect } from '@playwright/test';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const SPEC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPEC_DIR, '../..');

// Whitelist (예외 허용 — 명시적 console 사용)
const EXCLUDED_REL_PATHS = [
  'src/utils/logger.ts',
  'packages/tomato-engine/src/utils/logger.ts',
];

const EXCLUDED_REL_GLOBS = [
  /^src\/plant\/diagnostics\//,
  /^packages\/tomato-engine\/diagnostics\//,
  /^growth-calibration\//,
  /^packages\/.*\/test-[^/]+\.ts$/,
  /^tests\//,
  /\.deprecated$/,
  /\/_archive\//,
];

const SCAN_ROOTS = [
  'src',
  'packages/tomato-engine/src',
];

const FORBIDDEN_RE = /\bconsole\.(log|info|debug|warn|error)\s*\(/;

async function walk(dir: string, acc: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full, acc);
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function isExcluded(relPath: string): boolean {
  if (EXCLUDED_REL_PATHS.includes(relPath)) return true;
  for (const re of EXCLUDED_REL_GLOBS) {
    if (re.test(relPath)) return true;
  }
  return false;
}

test.describe('Phase L6 — Logger enforcement', () => {
  test('LOGGER-NO-DIRECT-CONSOLE-01: production source의 직접 console 호출 0건', async () => {
    const hits: Array<{ file: string; line: number; snippet: string }> = [];

    for (const root of SCAN_ROOTS) {
      const absRoot = path.join(REPO_ROOT, root);
      try {
        await fs.access(absRoot);
      } catch {
        continue;
      }
      const files = await walk(absRoot);
      for (const abs of files) {
        const rel = path.relative(REPO_ROOT, abs);
        if (isExcluded(rel)) continue;
        const text = await fs.readFile(abs, 'utf-8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // 주석 line (// 또는 *) 제외
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
          if (FORBIDDEN_RE.test(line)) {
            hits.push({ file: rel, line: i + 1, snippet: line.trim().slice(0, 100) });
          }
        }
      }
    }

    // Reporting
    if (hits.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n========== LOGGER-NO-DIRECT-CONSOLE-01 violations ==========`);
      for (const h of hits.slice(0, 30)) {
        // eslint-disable-next-line no-console
        console.error(`  ${h.file}:${h.line}  ${h.snippet}`);
      }
      if (hits.length > 30) {
        // eslint-disable-next-line no-console
        console.error(`  ... ${hits.length - 30} more violations truncated`);
      }
    }

    expect(hits, `expected 0 direct console calls, found ${hits.length}`).toEqual([]);
  });

  test('LOGGER-NAMESPACE-WHITELIST-01: createLogger 인자는 LogNamespace literal만', async () => {
    // createLogger('X') 호출의 X가 다음 union member인지 검증
    const HOST_NS = new Set([
      'engine', 'scene', 'quality', 'progressive', 'skinplant',
      'overlay', 'growth', 'leaf', 'plant', 'app',
    ]);
    const ENGINE_NS = new Set(['growth']);  // tomato-engine subset

    const issues: Array<{ file: string; line: number; ns: string }> = [];
    const CALL_RE = /createLogger\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const root of SCAN_ROOTS) {
      const absRoot = path.join(REPO_ROOT, root);
      try {
        await fs.access(absRoot);
      } catch {
        continue;
      }
      const files = await walk(absRoot);
      for (const abs of files) {
        const rel = path.relative(REPO_ROOT, abs);
        if (isExcluded(rel)) continue;
        const text = await fs.readFile(abs, 'utf-8');
        let match: RegExpExecArray | null;
        CALL_RE.lastIndex = 0;
        while ((match = CALL_RE.exec(text)) !== null) {
          const ns = match[1];
          const isEnginePkg = rel.startsWith('packages/tomato-engine/');
          const allowed = isEnginePkg ? ENGINE_NS : HOST_NS;
          if (!allowed.has(ns)) {
            const beforeMatch = text.slice(0, match.index);
            const lineNum = beforeMatch.split('\n').length;
            issues.push({ file: rel, line: lineNum, ns });
          }
        }
      }
    }

    if (issues.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n========== LOGGER-NAMESPACE-WHITELIST-01 violations ==========`);
      for (const v of issues.slice(0, 30)) {
        // eslint-disable-next-line no-console
        console.error(`  ${v.file}:${v.line}  createLogger('${v.ns}')`);
      }
    }
    expect(issues, `expected 0 invalid namespace, found ${issues.length}`).toEqual([]);
  });

  test('LOGGER-IMPORT-PATTERN-01: createLogger 사용 파일은 모듈 상단에서 const log = createLogger(...)', async () => {
    // 패턴: 파일에 `createLogger(` 호출이 _있다면_ 다음 패턴이 _최소 1회_ 존재:
    //   `const log = createLogger(...)` (인자 unconstrained — namespace 검증은 WHITELIST에서)
    const issues: Array<{ file: string }> = [];
    const DECL_RE = /\bconst\s+\w+\s*=\s*createLogger\s*\(/;

    for (const root of SCAN_ROOTS) {
      const absRoot = path.join(REPO_ROOT, root);
      try {
        await fs.access(absRoot);
      } catch {
        continue;
      }
      const files = await walk(absRoot);
      for (const abs of files) {
        const rel = path.relative(REPO_ROOT, abs);
        if (isExcluded(rel)) continue;
        const text = await fs.readFile(abs, 'utf-8');
        if (!/createLogger\s*\(/.test(text)) continue;
        // createLogger 호출이 있으면 declaration도 있어야
        if (!DECL_RE.test(text)) {
          issues.push({ file: rel });
        }
      }
    }
    if (issues.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n========== LOGGER-IMPORT-PATTERN-01 violations ==========`);
      for (const v of issues) {
        // eslint-disable-next-line no-console
        console.error(`  ${v.file} — createLogger 호출은 있지만 'const xxx = createLogger(...)' 선언 없음`);
      }
    }
    expect(issues, `expected 0 import pattern violations, found ${issues.length}`).toEqual([]);
  });
});
