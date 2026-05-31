// 임시 진단 spec — 사진의 yellow-green dot이 왜 바닥에 있는지 추적.
//
// SkeletonOverlay leafDot.position = leaf.petioleCurve[last]. 그 좌표 +
// graph stem node 좌표 + camera 위치 dump.

import { test, type Page } from '@playwright/test';

async function enter(page: Page, day: number) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setMode(m: string): void; setUseImplicitMesh(v: boolean): void } } };
    w.__twinStore?.getState().setMode('single-plant');
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const w = window as unknown as { __twinStore?: { getState(): { setUseImplicitMesh(v: boolean): void } } };
  });
  await page.waitForTimeout(3000);
  await page.evaluate((d) => {
    const w = window as unknown as { __twinStore?: { getState(): { setSinglePlantMinute(m: number): void } } };
    w.__twinStore?.getState().setSinglePlantMinute(d * 1440 + 12 * 60);
  }, day);
  await page.waitForTimeout(3500);
}

test('LEAFDOT-DIAG: petiole tip 위치 + graph stem range + dot mesh world pos dump', async ({ page }) => {
  test.setTimeout(180_000);
  await enter(page, 90); // 성숙 plant — 사용자 사진과 같은 단계

  const report = await page.evaluate(() => {
    const w = window as unknown as {
      __skinplantGraph?: {
        nodes: Map<string, { id: string; type?: string; pos: { x: number; y: number; z: number } }>;
        edges: Map<string, { id: string; type: string; organAnchors?: Array<{ kind: string; anchorNodeId: string }> }>;
      };
      __debugScene?: { meshes?: Array<{ name: string; isEnabled(): boolean; absolutePosition: { x: number; y: number; z: number }; position: { x: number; y: number; z: number } }> };
      __twinStore?: { getState(): { showSkeleton?: boolean; setShowSkeleton?(v: boolean): void } };
    };

    // 1) Skeleton overlay 강제 켜기 — leafDot mesh가 생성되도록.
    const st = w.__twinStore?.getState();
    st?.setShowSkeleton?.(true);
    // 2) Semantic overlay 강제 켜기 — yellow-green anchor ring + node marker visible.
    const w2 = w as unknown as { __semanticOverlay?: { setVisible(v: boolean): void } };
    w2.__semanticOverlay?.setVisible(true);

    return {
      graphStemRange: (() => {
        if (!w.__skinplantGraph) return null;
        const stems = [...w.__skinplantGraph.nodes.values()].filter((n) => n.type === 'main-stem-node');
        if (stems.length === 0) return null;
        const ys = stems.map((n) => n.pos.y);
        return { count: stems.length, yMin: Math.min(...ys), yMax: Math.max(...ys) };
      })(),
      graphPetioleTips: (() => {
        if (!w.__skinplantGraph) return [];
        const tips = [...w.__skinplantGraph.nodes.values()].filter((n) => n.type === 'petiole-tip');
        return tips.slice(0, 8).map((n) => ({ id: n.id, pos: n.pos }));
      })(),
      graphPedicelTips: (() => {
        if (!w.__skinplantGraph) return [];
        const tips = [...w.__skinplantGraph.nodes.values()].filter((n) => n.type === 'pedicel-tip');
        return tips.slice(0, 8).map((n) => ({ id: n.id, pos: n.pos }));
      })(),
      leafDots: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        return ms
          .filter((m) => m.name.startsWith('skel_leafdot_'))
          .slice(0, 8)
          .map((m) => ({
            name: m.name,
            enabled: m.isEnabled(),
            world: { x: m.absolutePosition.x, y: m.absolutePosition.y, z: m.absolutePosition.z },
            local: { x: m.position.x, y: m.position.y, z: m.position.z },
          }));
      })(),
      lushGroupTransform: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const lush = ms.find((m) => m.name.startsWith('skinplant_lush_'));
        if (!lush) return null;
        return { world: { x: lush.absolutePosition.x, y: lush.absolutePosition.y, z: lush.absolutePosition.z } };
      })(),
      sampleLeafMesh: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const leaf = ms.find((m) => m.name.startsWith('skinplant_leaf_'));
        if (!leaf) return null;
        return {
          name: leaf.name,
          world: { x: leaf.absolutePosition.x, y: leaf.absolutePosition.y, z: leaf.absolutePosition.z },
          local: { x: leaf.position.x, y: leaf.position.y, z: leaf.position.z },
        };
      })(),
      cotyledonMeshes: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        return ms
          .filter((m) => m.name.startsWith('skinplant_cot_'))
          .map((m) => ({
            name: m.name,
            enabled: m.isEnabled(),
            world: { x: m.absolutePosition.x, y: m.absolutePosition.y, z: m.absolutePosition.z },
          }));
      })(),
      semanticMarkers: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const sphereLike = ms.filter((m) => m.name.startsWith('semantic_'));
        // 가장 낮은 4개 + 가장 높은 4개 — yMin/yMax range 확인.
        sphereLike.sort((a, b) => a.absolutePosition.y - b.absolutePosition.y);
        const summary = (m: typeof sphereLike[number]) => ({
          name: m.name,
          enabled: m.isEnabled(),
          world: { x: m.absolutePosition.x, y: m.absolutePosition.y, z: m.absolutePosition.z },
        });
        return {
          total: sphereLike.length,
          lowest: sphereLike.slice(0, 4).map(summary),
          highest: sphereLike.slice(-4).map(summary),
        };
      })(),
      cameraInfo: (() => {
        const w3 = w as unknown as { __debugCamera?: { position: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number } } };
        if (!w3.__debugCamera) return null;
        return {
          pos: { x: w3.__debugCamera.position.x, y: w3.__debugCamera.position.y, z: w3.__debugCamera.position.z },
          target: w3.__debugCamera.target ? { x: w3.__debugCamera.target.x, y: w3.__debugCamera.target.y, z: w3.__debugCamera.target.z } : null,
        };
      })(),
      otherYellowGreen: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const yellowGreenNames = [
          'skel_leafdot_', 'semantic_marker_', 'semantic_anchor_',
        ];
        return yellowGreenNames.map((prefix) => ({
          prefix,
          count: ms.filter((m) => m.name.startsWith(prefix)).length,
          enabledCount: ms.filter((m) => m.name.startsWith(prefix) && m.isEnabled()).length,
        }));
      })(),
      // ★★★★ 모든 attachment line의 boundingbox 길이 dump.
      // line vertex 구조 (thick band)는 endpoint마다 다수. boundingbox로
      // 정확한 line span 측정. 정상 = ≤15cm (leaf petiole 길이).
      attachLineBboxLengths: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const lines = ms.filter((m) => m.name.startsWith('semantic_attach_'));
        if (lines.length === 0) return null;
        const lengths: { name: string; spanM: number; bboxMin: { x: number; y: number; z: number }; bboxMax: { x: number; y: number; z: number } }[] = [];
        for (const m of lines) {
          const mm = m as unknown as { name: string; getBoundingInfo(): { boundingBox: { minimumWorld: { x: number; y: number; z: number }; maximumWorld: { x: number; y: number; z: number } } } };
          const bb = mm.getBoundingInfo().boundingBox;
          const dx = bb.maximumWorld.x - bb.minimumWorld.x;
          const dy = bb.maximumWorld.y - bb.minimumWorld.y;
          const dz = bb.maximumWorld.z - bb.minimumWorld.z;
          const span = Math.sqrt(dx * dx + dy * dy + dz * dz);
          lengths.push({
            name: mm.name,
            spanM: span,
            bboxMin: { x: bb.minimumWorld.x, y: bb.minimumWorld.y, z: bb.minimumWorld.z },
            bboxMax: { x: bb.maximumWorld.x, y: bb.maximumWorld.y, z: bb.maximumWorld.z },
          });
        }
        lengths.sort((a, b) => b.spanM - a.spanM);
        const summary = {
          total: lengths.length,
          maxM: lengths[0]?.spanM ?? 0,
          minM: lengths[lengths.length - 1]?.spanM ?? 0,
          meanM: lengths.reduce((s, x) => s + x.spanM, 0) / lengths.length,
          worst3: lengths.slice(0, 3),
          best3: lengths.slice(-3),
        };
        return summary;
      })(),
      // ★★★ 핵심 — attachment line vertex의 진짜 world position과
      // anchor의 leafMesh world position이 정확히 일치하는지.
      // 일치하지 않으면 좌표계 frame mismatch (SSOT #185 위반).
      attachmentLineFrameCheck: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const attachLines = ms.filter((m) => m.name.startsWith('semantic_attach_'));
        const leafMeshes = ms.filter((m) => m.name.startsWith('skinplant_leaf_'));
        if (attachLines.length === 0 || leafMeshes.length === 0) return null;
        // 첫 attachment line의 vertex 0 (anchor 측) world position 측정.
        const mm = attachLines[0] as unknown as {
          name: string;
          getVerticesData(k: string): Float32Array | null;
          getWorldMatrix(): { m: number[] };
          absolutePosition: { x: number; y: number; z: number };
        };
        const lvs = mm.getVerticesData('position');
        const lineMeshWorld = { x: mm.absolutePosition.x, y: mm.absolutePosition.y, z: mm.absolutePosition.z };
        // vertex 0 local
        const v0Local = lvs && lvs.length >= 3 ? { x: lvs[0], y: lvs[1], z: lvs[2] } : null;
        // vertex 1 local
        const v1Local = lvs && lvs.length >= 6 ? { x: lvs[3], y: lvs[4], z: lvs[5] } : null;
        // 가장 가까운 leaf mesh의 world position (anchor와 같아야).
        const nearLeafWorld = { x: leafMeshes[0].absolutePosition.x, y: leafMeshes[0].absolutePosition.y, z: leafMeshes[0].absolutePosition.z };
        // SemanticOverlay root와 lushGroup의 world matrix 비교.
        const lushMatch = (() => {
          const w3 = w as unknown as { __debugScene?: { transformNodes?: Array<{ name: string; getWorldMatrix(): { m: number[] }; absolutePosition: { x: number; y: number; z: number } }> } };
          const tns = w3.__debugScene?.transformNodes ?? [];
          const lush = tns.find((t) => t.name.startsWith('skinplant_lush_'));
          const sem = tns.find((t) => t.name === 'semantic_overlay_root');
          if (!lush || !sem) return { lushFound: !!lush, semFound: !!sem };
          return {
            lushWorld: { x: lush.absolutePosition.x, y: lush.absolutePosition.y, z: lush.absolutePosition.z },
            semWorld: { x: sem.absolutePosition.x, y: sem.absolutePosition.y, z: sem.absolutePosition.z },
            lushMatrix: lush.getWorldMatrix().m,
            semMatrix: sem.getWorldMatrix().m,
          };
        })();
        return {
          attachLineCount: attachLines.length,
          firstLineName: mm.name,
          lineMeshWorld,
          v0Local,
          v1Local,
          // line vertex world (mesh transform 적용 후)
          v0World: v0Local ? {
            x: lineMeshWorld.x + v0Local.x,
            y: lineMeshWorld.y + v0Local.y,
            z: lineMeshWorld.z + v0Local.z,
          } : null,
          v1World: v1Local ? {
            x: lineMeshWorld.x + v1Local.x,
            y: lineMeshWorld.y + v1Local.y,
            z: lineMeshWorld.z + v1Local.z,
          } : null,
          nearLeafWorld,
          // 진단: v0World가 어떤 leaf의 world position과 일치해야 함.
          // 좌표계 frame mismatch면 다른 위치.
          lushVsSemFrame: lushMatch,
        };
      })(),
      // ★★ SemanticOverlay ring world vs anchor world 일치 확인.
      // 만약 일치 안 하면 ring이 잘못된 곳에 그려짐 → line도 비정상 위치.
      semanticRingVsAnchor: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const rings = ms.filter((m) => m.name.startsWith('semantic_anchor_'));
        if (rings.length === 0 || !w.__skinplantGraph) return null;
        // anchor가 leaf_blade인 것의 anchorNode와 비교 — 위치 매칭.
        const g = w.__skinplantGraph as unknown as {
          nodes: Map<string, { pos: { x: number; y: number; z: number } }>;
          edges: Map<string, { organAnchors?: Array<{ id: string; anchorNodeId: string }> }>;
        };
        // 첫 5개 ring의 absolutePosition와 가장 가까운 anchor 매칭.
        const sample = rings.slice(0, 5).map((m, i) => {
          const ring = { x: m.absolutePosition.x, y: m.absolutePosition.y, z: m.absolutePosition.z };
          // 모든 anchor world pos 후보 — graph anchorNode.pos + lushGroup offset (1.062)
          // 직접 매칭 안 하고 ring world와 가장 가까운 anchorNode 찾기.
          let best: { id: string; nodeId: string; nodeWorld: { x: number; y: number; z: number }; distMm: number } | null = null;
          for (const edge of g.edges.values()) {
            if (!edge.organAnchors) continue;
            for (const a of edge.organAnchors) {
              const n = g.nodes.get(a.anchorNodeId);
              if (!n) continue;
              // lushGroup offset 보정 (worldPos = root.worldPos + node.pos).
              const ny = n.pos.y + 1.062;
              const nx = n.pos.x; const nz = n.pos.z;
              const dx = ring.x - nx; const dy = ring.y - ny; const dz = ring.z - nz;
              const distMm = Math.sqrt(dx * dx + dy * dy + dz * dz) * 1000;
              if (!best || distMm < best.distMm) {
                best = { id: a.id, nodeId: a.anchorNodeId, nodeWorld: { x: nx, y: ny, z: nz }, distMm };
              }
            }
          }
          return { ringName: m.name, ringWorld: ring, nearestAnchor: best };
        });
        return sample;
      })(),
      // ★ truss/fruit mesh world position vs graph pedicel_tip.
      fruitMeshVsGraphPedicel: (() => {
        const ms = w.__debugScene?.meshes ?? [];
        const trussNodes = ms.filter((m) => m.name.startsWith('skinplant_truss_'));
        if (trussNodes.length === 0 || !w.__skinplantGraph) return null;
        const g = w.__skinplantGraph as unknown as {
          nodes: Map<string, { id: string; type?: string; pos: { x: number; y: number; z: number } }>;
        };
        const pedicelTips = [...g.nodes.values()].filter((n) => n.type === 'pedicel-tip');
        return {
          trussCount: trussNodes.length,
          trussFirstWorld: trussNodes[0]
            ? { x: trussNodes[0].absolutePosition.x, y: trussNodes[0].absolutePosition.y, z: trussNodes[0].absolutePosition.z }
            : null,
          pedicelTipCount: pedicelTips.length,
          pedicelTipFirstWorld: pedicelTips[0]
            ? { x: pedicelTips[0].pos.x, y: pedicelTips[0].pos.y + 1.062, z: pedicelTips[0].pos.z }
            : null,
        };
      })(),
      // ★ 핵심 진단: 각 anchor의 (anchorNode.pos, rootNode.pos) 거리 측정.
      // 정상 거리 = 10-30cm. 1m+ 면 chain.rootNodeId가 잘못 매핑.
      anchorRootDistances: (() => {
        if (!w.__skinplantGraph) return null;
        const g = w.__skinplantGraph as unknown as {
          nodes: Map<string, { id: string; pos: { x: number; y: number; z: number } }>;
          edges: Map<string, {
            organAnchors?: Array<{
              id: string;
              kind: string;
              anchorNodeId: string;
              chain?: { rootNodeId: string; attachmentNodeId: string };
            }>;
          }>;
        };
        const samples: { id: string; kind: string; anchorY: number; rootY: number; distM: number; rootNodeId: string }[] = [];
        for (const edge of g.edges.values()) {
          if (!edge.organAnchors) continue;
          for (const a of edge.organAnchors) {
            if (!a.chain) continue;
            const anchorN = g.nodes.get(a.anchorNodeId);
            const rootN = g.nodes.get(a.chain.rootNodeId);
            if (!anchorN || !rootN) continue;
            const dx = anchorN.pos.x - rootN.pos.x;
            const dy = anchorN.pos.y - rootN.pos.y;
            const dz = anchorN.pos.z - rootN.pos.z;
            const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
            samples.push({
              id: a.id,
              kind: a.kind,
              anchorY: anchorN.pos.y,
              rootY: rootN.pos.y,
              distM,
              rootNodeId: a.chain.rootNodeId,
            });
          }
        }
        // 가장 긴 거리 top 8 — 잘못된 매핑 catch.
        samples.sort((a, b) => b.distM - a.distM);
        const byKind: Record<string, { count: number; meanM: number; maxM: number }> = {};
        for (const s of samples) {
          const cur = byKind[s.kind] ?? { count: 0, meanM: 0, maxM: 0 };
          cur.count++;
          cur.meanM += s.distM;
          if (s.distM > cur.maxM) cur.maxM = s.distM;
          byKind[s.kind] = cur;
        }
        for (const k of Object.keys(byKind)) byKind[k].meanM /= byKind[k].count;
        return {
          totalAnchors: samples.length,
          summaryByKind: byKind,
          worstTop8: samples.slice(0, 8),
        };
      })(),
    };
  });

  // eslint-disable-next-line no-console
  console.log('\n=== LEAFDOT POSITION DIAG ===');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  // eslint-disable-next-line no-console
  console.log('=============================\n');
});
