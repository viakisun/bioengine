# Detection models

This directory holds ONNX model files served at `/models/*.onnx`. The repo
ships **no model binaries** — they are large and quickly stale.

## Phenotyping Survey — ONNX YOLOv8 detector

The `OnnxYoloDetector` (`src/scenarios/phenotyping/detectors/onnxYoloDetector.ts`)
loads `yolov8n.onnx` from this directory on first survey run.

### Quick start: download COCO-pretrained YOLOv8n

```bash
# Option A: Ultralytics (Python) - exports official weights to ONNX
pip install ultralytics
yolo export model=yolov8n.pt format=onnx opset=12 simplify=True
mv yolov8n.onnx public/models/

# Option B: Direct download (community mirror, ~12 MB)
curl -L -o public/models/yolov8n.onnx \
  https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.onnx
```

Verify:

```bash
ls -lh public/models/yolov8n.onnx
# -rw-r--r--  1 user  staff  12M ...  yolov8n.onnx
```

The detector treats COCO classes `apple (47)`, `orange (49)`, `banana (46)`,
`carrot (53)` as tomato proxies (red / turning / breaker / red bins
respectively). This is an MVP placeholder.

### Future: fine-tuned tomato model

Replace `yolov8n.onnx` with a model trained on a real tomato detection
dataset (e.g., MinneApple, TomatoOD, or a custom set). The detector will
need its `COCO_BIN_MAP` updated to match the new class ids — see
`onnxYoloDetector.ts`.

Class-id-to-bin mapping lives in the detector source. A future improvement
is to load a sidecar `yolov8-tomato.meta.json` describing class → bin.

### Other detectors (no model needed)

- `HsvDetector` — pixel color thresholding, zero dependencies.
- `GroundTruthDetector` — reads simulator state directly. Useful for
  comparing CV results against ground truth.

Switch between detectors in Settings → Detection algorithm.
