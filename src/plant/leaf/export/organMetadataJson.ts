// organMetadataJson — V11 per-frame organ metadata export (Leaf Module v0.1).
//
// Emits a JSON snapshot of the LeafOrganGraph suitable for robot training
// dataset adapters (later v0.2+ pipelines will extend this for ROS / USD /
// glTF). v0.1 is the data-layout contract; downstream adapters will not
// alter the schema, only consume it.
//
// Schema versioning: 'leafOrganMetadata.v1'. Bump when fields change in a
// breaking way; minor additions are forward-compatible.

import type {
  CompoundLeafOrgan,
  LeafGenomeSample,
  LeafOrganGraph,
  LeafletMorphologyNode,
} from '../LeafOrganGraph';

export interface LeafOrganMetadataJson {
  schemaVersion: 'leafOrganMetadata.v1';
  generatedAt: string;
  cultivar?: string;
  ageDaysAtSnapshot?: number;
  rngVersion?: string;

  summary: {
    compoundLeafCount: number;
    leafletCount: number;
    totalLeafAreaM2: number;
  };

  compoundLeaves: CompoundLeafMetadataJson[];
}

export interface CompoundLeafMetadataJson {
  id: string;
  parentStemEdgeId: string;
  attachNodeId: string;
  petioleEdgeId?: string;
  rachisId: string;
  rachisArcLengthM: number;
  rachisDroopAngleDeg: number;
  maturity: number;
  ageDays: number;
  leafAreaM2: number;
  genome: LeafGenomeSampleJson;
  leaflets: LeafletMetadataJson[];
}

export interface LeafletMetadataJson {
  id: string;
  parentRachisId: string;
  attachOnRachisT: number;
  side: LeafletMorphologyNode['side'];
  lengthM: number;
  maxHalfWidthM: number;
  aspect: number;
  areaM2: number;
}

export interface LeafGenomeSampleJson {
  seed: number;
  rngVersion: LeafGenomeSample['rngVersion'];
  leafletCountBias: number;
  asymmetryBias: number;
  lengthScale: number;
  widthScale: number;
  droopBias: number;
}

export interface ExportOrganMetadataOptions {
  cultivar?: string;
  ageDaysAtSnapshot?: number;
}

export function exportOrganMetadataJson(
  graph: LeafOrganGraph,
  opts: ExportOrganMetadataOptions = {},
): LeafOrganMetadataJson {
  let leafletCount = 0;
  let totalLeafAreaM2 = 0;

  const compoundLeaves: CompoundLeafMetadataJson[] = graph.compoundLeaves.map((c) => {
    leafletCount += c.leaflets.length;
    totalLeafAreaM2 += c.leafAreaM2Computed;
    return compoundToJson(c);
  });

  return {
    schemaVersion: 'leafOrganMetadata.v1',
    generatedAt: new Date().toISOString(),
    cultivar: opts.cultivar,
    ageDaysAtSnapshot: opts.ageDaysAtSnapshot,
    rngVersion: graph.compoundLeaves[0]?.genome.rngVersion,
    summary: {
      compoundLeafCount: graph.compoundLeaves.length,
      leafletCount,
      totalLeafAreaM2,
    },
    compoundLeaves,
  };
}

function compoundToJson(c: CompoundLeafOrgan): CompoundLeafMetadataJson {
  return {
    id: c.id,
    parentStemEdgeId: c.parentStemEdgeId,
    attachNodeId: c.attachNodeId,
    petioleEdgeId: c.petioleEdgeId,
    rachisId: c.rachisGuide.id,
    rachisArcLengthM: c.rachisGuide.arcLengthM,
    rachisDroopAngleDeg: c.rachisGuide.droopAngleDeg,
    maturity: c.maturity,
    ageDays: c.ageDays,
    leafAreaM2: c.leafAreaM2Computed,
    genome: { ...c.genome },
    leaflets: c.leaflets.map(leafletToJson),
  };
}

function leafletToJson(l: LeafletMorphologyNode): LeafletMetadataJson {
  const aspect = l.maxHalfWidthM > 0 ? l.lengthM / (2 * l.maxHalfWidthM) : 0;
  return {
    id: l.id,
    parentRachisId: l.parentRachisId,
    attachOnRachisT: l.attachOnRachisT,
    side: l.side,
    lengthM: l.lengthM,
    maxHalfWidthM: l.maxHalfWidthM,
    aspect,
    areaM2: l.areaM2Computed,
  };
}
