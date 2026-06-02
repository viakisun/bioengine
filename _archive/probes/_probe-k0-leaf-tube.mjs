// K0-1 — Leaf hierarchy tube audit.
// 사용자 v23 #3: primary leaflet count vs lateral-vein edge count 대응.
//
// 출력:
//   - 5 edge types (petiole / leaf-rachis / lateral-vein / petiolule / sub-vein)
//     count + avg bonePath length + r0/r1 분포
//   - renderPolicy.skinVisibleFraction 현재 값
//   - 잎별 expected vs actual edge count 대응

import { chromium } from 'playwright';

const URL = 'http://localhost:8090/';
const DAY = 45;
const LEAF_TUBE_TYPES = ['petiole', 'leaf-rachis', 'lateral-vein', 'petiolule', 'sub-vein'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('page error:', err.message));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate((d) => {
    const w = window;
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, DAY);
  await page.waitForTimeout(3500);

  const probe = await page.evaluate((LEAF_TUBE_TYPES) => {
    const w = window;
    const graph = w.__lastGraph;
    if (!graph?.edges || !graph?.nodes) return { error: 'no graph' };

    // Per-type aggregate.
    const perType = {};
    for (const t of LEAF_TUBE_TYPES) perType[t] = {
      count: 0,
      lengths: [],
      r0s: [],
      r1s: [],
      skinVisibleFraction: null,
    };

    for (const edge of graph.edges.values()) {
      if (!LEAF_TUBE_TYPES.includes(edge.type)) continue;
      const e = perType[edge.type];
      e.count++;
      // bonePath length
      let len = 0;
      for (const b of edge.bonePath) {
        len += Math.hypot(b.p1.x - b.p0.x, b.p1.y - b.p0.y, b.p1.z - b.p0.z);
      }
      e.lengths.push(len);
      if (edge.bonePath.length > 0) {
        e.r0s.push(edge.bonePath[0].r0);
        e.r1s.push(edge.bonePath[edge.bonePath.length - 1].r1);
      }
      // skinVisibleFraction (only need one sample per type — should be uniform)
      if (e.skinVisibleFraction == null && edge.renderPolicy?.skinVisibleFraction != null) {
        e.skinVisibleFraction = edge.renderPolicy.skinVisibleFraction;
      }
    }

    // Per-leaf expected vs actual.
    // group edges by leaf tag (axis${X}:n${Y}).
    const edgesByLeaf = new Map();
    for (const edge of graph.edges.values()) {
      if (!LEAF_TUBE_TYPES.includes(edge.type)) continue;
      const m = edge.id.match(/axis(\d+):n(\d+)/);
      if (!m) continue;
      const tag = `axis${m[1]}:n${m[2]}`;
      if (!edgesByLeaf.has(tag)) edgesByLeaf.set(tag, {
        petiole: 0, 'leaf-rachis': 0, 'lateral-vein': 0, petiolule: 0, 'sub-vein': 0,
      });
      edgesByLeaf.get(tag)[edge.type]++;
    }

    // leaflet counts per leaf.
    const leafletByLeaf = new Map();
    for (const node of graph.nodes.values()) {
      const ref = node.leafletRef;
      if (!ref) continue;
      const m = node.id.match(/axis(\d+):n(\d+)/);
      if (!m) continue;
      const tag = `axis${m[1]}:n${m[2]}`;
      if (!leafletByLeaf.has(tag)) leafletByLeaf.set(tag, {
        primary: 0, intercalary: 0, terminal: 0, secondary: 0,
      });
      leafletByLeaf.get(tag)[ref.position]++;
    }

    // Correspondence check.
    const correspondence = [];
    const violations = [];
    for (const [tag, leaflets] of leafletByLeaf) {
      const edges = edgesByLeaf.get(tag) ?? {
        petiole: 0, 'leaf-rachis': 0, 'lateral-vein': 0, petiolule: 0, 'sub-vein': 0,
      };
      const row = {
        tag,
        leaflets,
        edges,
        expected: {
          // primary leaflet 수 = lateral-vein edge 수
          'lateral-vein': leaflets.primary,
          // intercalary leaflet 수 = petiolule edge 수
          petiolule: leaflets.intercalary,
          // terminal leaflet 수 = 1 (단 petiole 1, leaf-rachis는 sub-rachis seg)
          // sub-vein은 secondary count = 0 (disabled)
        },
      };
      correspondence.push(row);

      // Violations
      if (leaflets.primary !== edges['lateral-vein']) {
        violations.push(`${tag}: primary=${leaflets.primary} != lateral-vein=${edges['lateral-vein']}`);
      }
      if (leaflets.intercalary !== edges.petiolule) {
        violations.push(`${tag}: intercalary=${leaflets.intercalary} != petiolule=${edges.petiolule}`);
      }
      // sub-vein은 secondary disabled (0)이어야
      if (leaflets.secondary !== edges['sub-vein']) {
        violations.push(`${tag}: secondary=${leaflets.secondary} != sub-vein=${edges['sub-vein']}`);
      }
    }

    // Aggregate stats.
    const stat = (a) => {
      if (a.length === 0) return null;
      a = a.slice().sort((x, y) => x - y);
      return {
        n: a.length, min: a[0], p50: a[Math.floor(a.length * 0.5)],
        p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1],
        avg: a.reduce((x, y) => x + y, 0) / a.length,
      };
    };

    const aggregate = {};
    for (const t of LEAF_TUBE_TYPES) {
      aggregate[t] = {
        count: perType[t].count,
        bonePathLengthM: stat(perType[t].lengths),
        r0M: stat(perType[t].r0s),
        r1M: stat(perType[t].r1s),
        skinVisibleFraction: perType[t].skinVisibleFraction,
      };
    }

    return {
      aggregate,
      correspondence,
      violations,
      verdict: violations.length === 0
        ? 'PASS — leaflet count vs edge count 대응 일치'
        : `FAIL — ${violations.length} violations`,
    };
  }, LEAF_TUBE_TYPES);

  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error('probe failed:', err);
  process.exit(1);
});
