// leafletInstanceLookup — V11 metadata lookup (Leaf Module v0.1).
//
// Maps Babylon faceId (from scene.pick → PickingInfo.faceId) to
// leafletId / compoundLeafId via the LeafletFaceGroup index ranges
// produced by buildLeafBladeMesh.
//
// SCOPE NOTE: v0.1 is METADATA LOOKUP ONLY. Render-target instance mask
// (per-pixel ID texture) is deliberately deferred to v0.2+:
// `leafletInstanceMaskRenderPass.ts` (not in this module).
//
// Algorithm: binary search over leafletGroups sorted by indexStart.
// O(log N) lookup. groups are emitted in increasing indexStart order by
// the builder, so we can binary search directly.

import type { LeafBladeMesh } from '../buildLeafBladeMesh';
import type { LeafletFaceGroup } from '../LeafOrganGraph';

export interface LeafletPickResult {
  leafletId: string;
  compoundLeafId: string;
  side: LeafletFaceGroup['side'];
  /** Triangle index within this leaflet's strip (for debug overlay). */
  localTriangleIndex: number;
  /** True if the picked triangle is in an allowedDegenerateIndexRange. */
  inAllowedDegenerateRange: boolean;
  allowedDegenerateReason?: 'base_collapse' | 'tip_collapse';
}

/**
 * Picker bound to a LeafBladeMesh. Reusable across many scene.pick calls.
 */
export class LeafletInstanceLookup {
  private readonly groups: LeafletFaceGroup[];

  constructor(blade: LeafBladeMesh) {
    // Builder emits groups in insertion order, which is increasing
    // indexStart. Defensive copy + sort to handle any reordering.
    this.groups = [...blade.leafletGroups].sort((a, b) => a.indexStart - b.indexStart);
  }

  /** Look up leaflet from Babylon faceId (triangle index in mesh.indices). */
  lookupByFaceId(faceId: number): LeafletPickResult | null {
    if (faceId < 0) return null;
    const indexInBuffer = faceId * 3;
    const group = this.binarySearchGroup(indexInBuffer);
    if (!group) return null;

    const localTriangleIndex = (indexInBuffer - group.indexStart) / 3;
    const ranges = group.allowedDegenerateIndexRanges ?? [];
    let inAllowed = false;
    let reason: 'base_collapse' | 'tip_collapse' | undefined;
    for (const r of ranges) {
      if (indexInBuffer >= r.indexStart && indexInBuffer < r.indexStart + r.indexCount) {
        inAllowed = true;
        reason = r.reason;
        break;
      }
    }

    return {
      leafletId: group.leafletId,
      compoundLeafId: group.compoundLeafId,
      side: group.side,
      localTriangleIndex,
      inAllowedDegenerateRange: inAllowed,
      allowedDegenerateReason: reason,
    };
  }

  /** Collect all leaflets in a compound (for "cut entire leaf" workflow). */
  leafletsInCompound(compoundLeafId: string): LeafletFaceGroup[] {
    return this.groups.filter((g) => g.compoundLeafId === compoundLeafId);
  }

  private binarySearchGroup(indexInBuffer: number): LeafletFaceGroup | null {
    let lo = 0;
    let hi = this.groups.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = this.groups[mid];
      if (indexInBuffer < g.indexStart) {
        hi = mid - 1;
      } else if (indexInBuffer >= g.indexStart + g.indexCount) {
        lo = mid + 1;
      } else {
        return g;
      }
    }
    return null;
  }
}
