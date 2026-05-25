// devHook — window.__leafModule namespace exposed by BabylonEngine in DEV.
//
// Centralized entry point for Playwright V9-V12 verification + DevTools
// inspection. All functions take an explicit Scene reference so they can be
// reused across multiple plant instances if needed.
//
// Usage in console / Playwright:
//   __leafModule.findLeafBladeMesh()
//   __leafModule.metadata()             // organ JSON snapshot (V11)
//   __leafModule.botanicalReport()      // V9 reports
//   __leafModule.geometryReport()       // V10 metrics
//   __leafModule.pickByFaceId(faceId)   // V11 lookup
//   __leafModule.summary()              // one-line consolidated string

import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { LeafBladeMesh } from './buildLeafBladeMesh';
import type { LeafOrganGraph, LeafletFaceGroup } from './LeafOrganGraph';
import {
  computeBotanicalReports,
  summarizeBotanicalReports,
  type BotanicalReportBundle,
} from './validation/botanicalMetrics';
import {
  computeGeometryReport,
  summarizeGeometryReport,
  type GeometryReport,
} from './validation/geometryMetrics';
import {
  exportOrganMetadataJson,
  type LeafOrganMetadataJson,
} from './export/organMetadataJson';
import { LeafletInstanceLookup, type LeafletPickResult } from './export/leafletInstanceLookup';

export interface LeafModuleDevHook {
  findLeafBladeMesh(): Mesh | null;
  graph(): LeafOrganGraph | null;
  faceGroups(): LeafletFaceGroup[];
  metadata(cultivar?: string): LeafOrganMetadataJson | null;
  botanicalReport(cultivar?: string): BotanicalReportBundle | null;
  geometryReport(): GeometryReport | null;
  pickByFaceId(faceId: number): LeafletPickResult | null;
  summary(): string;
}

export function makeLeafModuleDevHook(scene: Scene): LeafModuleDevHook {
  function findLeafBladeMesh(): Mesh | null {
    for (const m of scene.meshes) {
      if (m.name.startsWith('skinplant_leaf_')) return m as Mesh;
    }
    return null;
  }

  function getBladeFromMesh(mesh: Mesh): LeafBladeMesh | null {
    const md = mesh.metadata as
      | {
          leafletGroups?: LeafletFaceGroup[];
          leafletIdByIdx?: string[];
          vertexLeafletTag?: Uint16Array;
          leafOrganGraphRef?: LeafOrganGraph;
        }
      | undefined;
    if (!md?.leafletGroups || !md.leafletIdByIdx || !md.vertexLeafletTag) return null;
    return {
      mesh,
      leafletGroups: md.leafletGroups,
      leafletIdByIdx: md.leafletIdByIdx,
      vertexLeafletTag: md.vertexLeafletTag,
      stats: {
        compoundLeafCount: md.leafOrganGraphRef?.compoundLeaves.length ?? 0,
        leafletCount: md.leafletIdByIdx.length,
        vertexCount: (mesh.getTotalVertices?.() ?? 0),
        triangleCount: (mesh.getTotalIndices?.() ?? 0) / 3,
        buildMs: 0,
      },
    };
  }

  return {
    findLeafBladeMesh,

    graph() {
      const mesh = findLeafBladeMesh();
      if (!mesh) return null;
      const md = mesh.metadata as { leafOrganGraphRef?: LeafOrganGraph } | undefined;
      return md?.leafOrganGraphRef ?? null;
    },

    faceGroups() {
      const mesh = findLeafBladeMesh();
      if (!mesh) return [];
      const md = mesh.metadata as { leafletGroups?: LeafletFaceGroup[] } | undefined;
      return md?.leafletGroups ?? [];
    },

    metadata(cultivar?: string) {
      const g = this.graph();
      if (!g) return null;
      return exportOrganMetadataJson(g, { cultivar });
    },

    botanicalReport(cultivar?: string) {
      const g = this.graph();
      if (!g) return null;
      return computeBotanicalReports(g, { cultivar, confidence: 'estimated' });
    },

    geometryReport() {
      const mesh = findLeafBladeMesh();
      if (!mesh) return null;
      const blade = getBladeFromMesh(mesh);
      if (!blade) return null;
      return computeGeometryReport(blade);
    },

    pickByFaceId(faceId: number) {
      const mesh = findLeafBladeMesh();
      if (!mesh) return null;
      const blade = getBladeFromMesh(mesh);
      if (!blade) return null;
      const lookup = new LeafletInstanceLookup(blade);
      return lookup.lookupByFaceId(faceId);
    },

    summary() {
      const lines: string[] = [];
      const mesh = findLeafBladeMesh();
      if (!mesh) return '[leafModule] no leaf blade mesh present.';
      const g = this.graph();
      if (g) {
        const bot = computeBotanicalReports(g, { confidence: 'estimated' });
        lines.push(summarizeBotanicalReports(bot));
      }
      const geo = this.geometryReport();
      if (geo) lines.push(summarizeGeometryReport(geo));
      lines.push(`[mesh] verts=${mesh.getTotalVertices()} tris=${mesh.getTotalIndices() / 3}`);
      return lines.join('\n');
    },
  };
}
