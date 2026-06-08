// W3.f (§18) — COCO JSON writer (mvp).
//
// 표준 COCO 포맷: info / images / categories / annotations.
// docs/proposal/07-foundry-batch-and-labels.md §5.1 기준.
//
// mvp 한계:
//   - bbox는 추정 (실 mesh ID → 픽셀 분석 cuttable, V2)
//   - segmentation은 placeholder polygon
//   - annotations 1장당 1개 dummy fruit annotation
//
// 향후 V2 evolution: mask shader (W2.g cuttable) 픽셀 분석 → 정확 bbox/segmentation.

export interface CocoImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
}

export interface CocoCategory {
  id: number;
  name: string;
  supercategory: string;
}

export interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
  segmentation: number[][]; // polygon RLE
  area: number;
  iscrowd: number;
  attributes?: {
    instance_id?: number;
    visible_fraction?: number;
    occluding_class?: string;
    world_coord?: [number, number, number];
    growth_day?: number;
    seed?: string;
  };
}

export interface CocoInfo {
  description: string;
  scenarioId?: string;
  seed?: string;
  reproducibilitySeal?: string;
  conditions?: Record<string, unknown>;
  version: string;
  date_created: string;
}

export interface CocoDataset {
  info: CocoInfo;
  images: CocoImage[];
  categories: CocoCategory[];
  annotations: CocoAnnotation[];
}

const FRUIT_CATEGORIES: CocoCategory[] = [
  { id: 100, name: 'fruit-stage-0', supercategory: 'fruit' },
  { id: 101, name: 'fruit-stage-1', supercategory: 'fruit' },
  { id: 102, name: 'fruit-stage-2', supercategory: 'fruit' },
  { id: 103, name: 'fruit-stage-3', supercategory: 'fruit' },
  { id: 104, name: 'fruit-stage-4', supercategory: 'fruit' },
  { id: 105, name: 'fruit-stage-5', supercategory: 'fruit' },
];

export interface FrameCaptureMeta {
  frameIndex: number;
  fileName: string;
  width: number;
  height: number;
  day: number;
  seed: string;
  // 단순화: 1 frame에 1 dummy annotation
  fruitCount?: number;
  ripenStage?: number;
}

export function buildCocoDataset(
  scenarioId: string,
  baseSeed: string,
  frames: FrameCaptureMeta[],
): CocoDataset {
  const images: CocoImage[] = frames.map((f) => ({
    id: f.frameIndex,
    file_name: f.fileName,
    width: f.width,
    height: f.height,
  }));

  const annotations: CocoAnnotation[] = [];
  let annId = 1;
  for (const f of frames) {
    // mvp: 1 frame당 1 dummy annotation. bbox는 화면 중앙 식물 영역으로 추정.
    const cw = f.width;
    const ch = f.height;
    const bw = Math.round(cw * 0.18);
    const bh = Math.round(ch * 0.32);
    const bx = Math.round(cw / 2 - bw / 2);
    const by = Math.round(ch / 2 - bh / 2);

    const ripenStage = f.ripenStage ?? Math.floor(Math.random() * 6);
    const categoryId = 100 + ripenStage;

    annotations.push({
      id: annId++,
      image_id: f.frameIndex,
      category_id: categoryId,
      bbox: [bx, by, bw, bh],
      // 간이 polygon: 4 corner rectangle (실제 segmentation은 mask shader 필요)
      segmentation: [[bx, by, bx + bw, by, bx + bw, by + bh, bx, by + bh]],
      area: bw * bh,
      iscrowd: 0,
      attributes: {
        instance_id: f.frameIndex * 1000 + 1,
        visible_fraction: 0.85,
        growth_day: f.day,
        seed: f.seed,
      },
    });
  }

  return {
    info: {
      description: `Phytosim Foundry — ${scenarioId}`,
      scenarioId,
      seed: baseSeed,
      version: '1.0',
      date_created: new Date().toISOString(),
    },
    images,
    categories: FRUIT_CATEGORIES,
    annotations,
  };
}

/** Trigger a JSON download for the COCO dataset. */
export function downloadCoco(dataset: CocoDataset, filename: string = 'coco.json'): void {
  const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
