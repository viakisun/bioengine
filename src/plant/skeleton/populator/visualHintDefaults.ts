// SSOT #187 — Default NodeVisualHint per SkeletonNodeType.
//
// Iter 26 PR 2-1. The populator writes one of these objects onto each node;
// SkeletonOverlay reads it as-is (원칙 2). To change a marker's color or
// shape, edit this table — overlay code stays untouched.
//
// See: docs/architecture/SEMANTIC_GRAPH.md sections 0 (원칙 2), 5.

import type {
  NodeVisualHint,
  SkeletonNodeType,
} from '../PlantSkeletonGraph';

/** Per-node-type default appearance. Populator clones this into node.visualHint. */
export const NODE_VISUAL_HINT_DEFAULTS: Record<SkeletonNodeType, NodeVisualHint> = {
  'main-stem-node': {
    markerColor: '#8B4513', // saddle brown
    markerShape: 'sphere',
    markerSizeM: 0.006,
  },
  'side-shoot-node': {
    markerColor: '#A0522D', // sienna
    markerShape: 'sphere',
    markerSizeM: 0.005,
  },
  'petiole-root': {
    markerColor: '#556B2F', // dark olive green
    markerShape: 'sphere',
    markerSizeM: 0.0035,
  },
  'petiole-tip': {
    markerColor: '#6B8E23', // olive drab
    markerShape: 'sphere',
    markerSizeM: 0.0030,
  },
  'leaf-blade-root': {
    markerColor: '#9ACD32', // yellow green
    markerShape: 'disk',
    markerSizeM: 0.0035,
  },
  'truss-root': {
    markerColor: '#8B0000', // dark red
    markerShape: 'sphere',
    markerSizeM: 0.0040,
  },
  'peduncle-node': {
    markerColor: '#A52A2A', // brown
    markerShape: 'sphere',
    markerSizeM: 0.0035,
  },
  'rachis-node': {
    markerColor: '#CD5C5C', // indian red
    markerShape: 'sphere',
    markerSizeM: 0.0030,
  },
  'pedicel-root': {
    markerColor: '#B22222', // firebrick
    markerShape: 'sphere',
    markerSizeM: 0.0028,
  },
  'pedicel-tip': {
    markerColor: '#DC143C', // crimson
    markerShape: 'sphere',
    markerSizeM: 0.0028,
  },
  'fruit-root': {
    markerColor: '#FF6347', // tomato
    markerShape: 'ring',
    markerSizeM: 0.0040,
  },
  'flower-root': {
    markerColor: '#FFD700', // gold
    markerShape: 'ring',
    markerSizeM: 0.0030,
  },
  'calyx-root': {
    markerColor: '#228B22', // forest green
    markerShape: 'ring',
    markerSizeM: 0.0030,
  },
};

/** Returns a fresh visualHint clone for the given type (label injected by caller). */
export function defaultVisualHint(
  type: SkeletonNodeType,
  label?: string,
): NodeVisualHint {
  const base = NODE_VISUAL_HINT_DEFAULTS[type];
  return label !== undefined ? { ...base, label } : { ...base };
}
